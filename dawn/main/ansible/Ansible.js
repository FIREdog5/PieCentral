import dgram from 'dgram';
import net from 'net';
import { ipcMain } from 'electron';
import ProtoBuf from 'protobufjs';
import _ from 'lodash';

import RendererBridge from '../RendererBridge';
import { updateConsole } from '../../renderer/actions/ConsoleActions';
import {
  ansibleDisconnect,
  notifyChange,
  infoPerMessage,
  updateCodeStatus,
} from '../../renderer/actions/InfoActions';
import { updatePeripherals } from '../../renderer/actions/PeripheralActions';
import { uploadStatus, robotState, Logger, defaults } from '../../renderer/utils/utils';

const dawnBuilder = ProtoBuf.loadProtoFile(`${__dirname}/ansible.proto`);
const DawnData = dawnBuilder.build('DawnData');
const StudentCodeStatus = DawnData.StudentCodeStatus;
const runtimeBuilder = ProtoBuf.loadProtoFile(`${__dirname}/runtime.proto`);
const RuntimeData = runtimeBuilder.build('RuntimeData');
const notificationBuilder = ProtoBuf.loadProtoFile(`${__dirname}/notification.proto`);
const Notification = notificationBuilder.build('Notification');

const LISTEN_PORT = 1235;
const SEND_PORT = 1236;
const TCP_PORT = 1234;

function buildProto(data) {
  let status = null;
  switch (data.studentCodeStatus) {
    case robotState.TELEOP:
      status = StudentCodeStatus.TELEOP;
      break;
    case robotState.AUTONOMOUS:
      status = StudentCodeStatus.AUTONOMOUS;
      break;
    case robotState.ESTOP:
      status = StudentCodeStatus.ESTOP;
      break;
    default:
      status = StudentCodeStatus.IDLE;
  }

  const gamepads = _.map(_.toArray(data.gamepads), (gamepad) => {
    const axes = _.toArray(gamepad.axes);
    const buttons = _.map(_.toArray(gamepad.buttons), Boolean);
    return new DawnData.Gamepad({
      index: gamepad.index,
      axes,
      buttons,
    });
  });

  return new DawnData({
    student_code_status: status,
    gamepads,
  });
}

class ListenSocket {
  constructor(logger) {
    this.logger = logger;
    this.statusUpdateTimeout = 0;
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.studentCodeStatusListener = this.studentCodeStatusListener.bind(this);

    /*
     * Runtime message handler. Sends robot state to store.info
     * and raw sensor array to peripheral reducer
     */
    this.socket.on('message', (msg) => {
      try {
        const {
          robot_state: stateRobot,
          sensor_data: sensorData,
        } = RuntimeData.decode(msg);
        this.logger.log('Dawn received UDP');
        RendererBridge.reduxDispatch(infoPerMessage(stateRobot));
        if (stateRobot === RuntimeData.State.STUDENT_STOPPED) {
          if (this.statusUpdateTimeout > 0) {
            this.statusUpdateTimeout -= 1;
          } else {
            this.statusUpdateTimeout = 0;
            RendererBridge.reduxDispatch(updateCodeStatus(robotState.IDLE));
          }
        }
        RendererBridge.reduxDispatch(updatePeripherals(sensorData));
      } catch (err) {
        this.logger.log('Error decoding UDP');
        this.logger.log(err);
      }
    });

    this.socket.on('error', (err) => {
      this.logger.log('UDP listening error');
      this.logger.log(err);
    });

    this.socket.on('close', () => {
      RendererBridge.reduxDispatch(ansibleDisconnect());
      this.logger.log('UDP listening closed');
    });

    this.socket.bind(LISTEN_PORT, () => {
      this.logger.log(`UDP Bound to ${LISTEN_PORT}`);
    });
    ipcMain.on('studentCodeStatus', this.studentCodeStatusListener);
  }

  studentCodeStatusListener(event, { studentCodeStatus }) {
    if (studentCodeStatus === StudentCodeStatus.TELEOP ||
    studentCodeStatus === StudentCodeStatus.AUTONOMOUS) {
      this.statusUpdateTimeout = 5;
    }
  }

  close() {
    this.socket.close();
    ipcMain.removeListener('studentCodeStatus', this.studentCodeStatusListener);
  }
}

class SendSocket {
  constructor(logger) {
    this.logger = logger;
    this.runtimeIP = defaults.IPADDRESS;
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.sendGamepadMessages = this.sendGamepadMessages.bind(this);
    this.ipAddressListener = this.ipAddressListener.bind(this);

    this.socket.on('error', (err) => {
      this.logger.log('UDP sending error');
      this.logger.log(err);
    });

    this.socket.on('close', () => {
      this.logger.log('UDP sending closed');
    });

    ipcMain.on('stateUpdate', this.sendGamepadMessages);

    /*
     * IPC Connection with ConfigBox.js' saveChanges()
     * Receives new IP Address to send messages to.
     */
    ipcMain.on('ipAddress', this.ipAddressListener);
  }

  /*
   * IPC Connection with sagas.js' ansibleGamepads()
   * Sends messages when Gamepad information changes
   * or when 100 ms has passed (with 50 ms cooldown)
   */
  sendGamepadMessages(event, data) {
    const message = buildProto(data).encode().toBuffer();
    this.logger.log(`Dawn sent UDP to ${this.runtimeIP}`);
    this.socket.send(message, SEND_PORT, this.runtimeIP);
  }

  ipAddressListener(event, { ipAddress }) {
    this.runtimeIP = ipAddress;
  }

  close() {
    this.socket.close();
    ipcMain.removeListener('stateUpdate', this.sendGamepadMessages);
    ipcMain.removeListener('ipAddress', this.ipAddressListener);
  }
}

class TCPSocket {
  constructor(socket, logger) {
    this.waitRuntimeConfirm = this.waitRuntimeConfirm.bind(this);
    this.tryUpload = this.tryUpload.bind(this);
    this.logger = logger;

    this.socket = socket;
    this.received = false;

    this.logger.log('Runtime connected');
    this.socket.on('end', () => {
      this.logger.log('Runtime disconnected');
    });

    this.socket.on('data', (data) => {
      this.received = true;
      const decoded = Notification.decode(data);
      this.logger.log('Dawn received TCP');
      if (decoded.header === Notification.Type.STUDENT_RECEIVED) {
        RendererBridge.reduxDispatch(notifyChange(uploadStatus.RECEIVED));
      } else if (decoded.header === Notification.Type.CONSOLE_LOGGING) {
        RendererBridge.reduxDispatch(updateConsole(decoded.console_output));
      } else {
        this.logger.log(`${decoded.header}-**************************`);
      }
    });

    /*
     * IPC Connection with Editor.js' upload()
     * When Runtime responds back with confirmation,
     * notifyChange sends received signal (see tcp, received variables)
     */
    ipcMain.on('NOTIFY_UPLOAD', this.tryUpload);
  }

  waitRuntimeConfirm(message, count) {
    if (count > 3) {
      this.logger.log('Runtime failed to confirm');
      RendererBridge.reduxDispatch(notifyChange(uploadStatus.ERROR));
    } else if (!this.received) {
      try {
        this.socket.write(message, () => {
          this.logger.log(`Runtime notified: try ${count + 1}`);
        });
      } catch (e) {
        this.logger.log(e);
      }

      setTimeout(() => {
        this.waitRuntimeConfirm(message, count + 1);
      }, 1000);
    }
  }

  tryUpload() {
    const message = new Notification({
      header: Notification.Type.STUDENT_SENT,
      console_output: '',
    }).encode().toBuffer();

    this.received = false;
    RendererBridge.reduxDispatch(notifyChange(uploadStatus.SENT));
    this.waitRuntimeConfirm(message, 0);
  }

  close() {
    this.socket.end();
    ipcMain.removeListener('NOTIFY_UPLOAD', this.tryUpload);
  }
}

class TCPServer {
  constructor(logger) {
    this.socket = null;
    this.tcp = net.createServer((socket) => {
      this.socket = new TCPSocket(socket, logger);
    });

    this.logger = logger;

    this.tcp.on('error', (err) => {
      this.logger.log('TCP error');
      this.logger.log(err);
    });

    this.tcp.listen(TCP_PORT, () => {
      this.logger.log(`Dawn listening on port ${TCP_PORT}`);
    });
  }

  close() {
    if (this.socket) {
      this.socket.close();
    }

    this.tcp.close();
  }
}

const Ansible = {
  conns: [],
  logger: new Logger('ansible', 'Ansible Debug'),
  setup() {
    this.conns = [
      new ListenSocket(this.logger),
      new SendSocket(this.logger),
      new TCPServer(this.logger),
    ];
  },
  close() {
    this.conns.forEach(conn => conn.close()); // Logger's fs closes automatically
  },
};

export default Ansible;
