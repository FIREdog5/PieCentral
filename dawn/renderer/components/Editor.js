import React from 'react';
import {
  Panel,
  ButtonGroup,
  ButtonToolbar,
  DropdownButton,
  MenuItem,
} from 'react-bootstrap';
import AceEditor from 'react-ace';
import { remote, ipcRenderer } from 'electron';
import storage from 'electron-json-storage';
import _ from 'lodash';

// React-ace extensions and modes
import 'brace/ext/language_tools';
import 'brace/ext/searchbox';
import 'brace/mode/python';
// React-ace themes
import 'brace/theme/monokai';
import 'brace/theme/github';
import 'brace/theme/tomorrow';
import 'brace/theme/kuroir';
import 'brace/theme/twilight';
import 'brace/theme/xcode';
import 'brace/theme/textmate';
import 'brace/theme/solarized_dark';
import 'brace/theme/solarized_light';
import 'brace/theme/terminal';

import ConsoleOutput from './ConsoleOutput';
import TooltipButton from './TooltipButton';
import { pathToName, uploadStatus, robotState, defaults } from '../utils/utils';

const Client = require('ssh2').Client;

const dialog = remote.dialog;
const currentWindow = remote.getCurrentWindow();

class Editor extends React.Component {
  /*
   * ASCII Enforcement
   */
  static onEditorPaste(pasteData) {
    let correctedText = pasteData.text;
    correctedText = correctedText.normalize('NFD');
    correctedText = correctedText.replace(/[”“]/g, '"');
    correctedText = correctedText.replace(/[‘’]/g, "'");
    correctedText = this.correctText(correctedText);
    // TODO: Create some notification that an attempt was made at correcting non-ASCII chars.
    pasteData.text = correctedText; // eslint-disable-line no-param-reassign
  }

  // TODO: Take onEditorPaste items and move to utils?
  static correctText(text) {
    return text.replace(/[^\x00-\x7F]/g, ''); // eslint-disable-line no-control-regex
  }

  constructor(props) {
    super(props);
    this.consoleHeight = 250; // pixels
    this.themes = [
      'monokai',
      'github',
      'tomorrow',
      'kuroir',
      'twilight',
      'xcode',
      'textmate',
      'solarized_dark',
      'solarized_light',
      'terminal',
    ];
    this.beforeUnload = this.beforeUnload.bind(this);
    this.onWindowResize = this.onWindowResize.bind(this);
    this.toggleConsole = this.toggleConsole.bind(this);
    this.getEditorHeight = this.getEditorHeight.bind(this);
    this.changeTheme = this.changeTheme.bind(this);
    this.increaseFontsize = this.increaseFontsize.bind(this);
    this.decreaseFontsize = this.decreaseFontsize.bind(this);
    this.startRobot = this.startRobot.bind(this);
    this.stopRobot = this.stopRobot.bind(this);
    this.upload = this.upload.bind(this);
    this.estop = this.estop.bind(this);
    this.state = {
      editorHeight: this.getEditorHeight(),
    };
  }

  /*
   * Confirmation Dialog on Quit, Stored Editor Settings, Window Size-Editor Re-render
   */
  componentDidMount() {
    this.CodeEditor.editor.setOption('enableBasicAutocompletion', true);

    storage.get('editorTheme', (err, data) => {
      if (err) throw err;
      if (!_.isEmpty(data)) this.props.onChangeTheme(data.theme);
    });

    storage.get('editorFontSize', (err, data) => {
      if (err) throw err;
      if (!_.isEmpty(data)) this.props.onChangeFontsize(data.editorFontSize);
    });

    window.addEventListener('beforeunload', this.beforeUnload);
    window.addEventListener('resize', this.onWindowResize, { passive: true });
  }

  componentWillUnmount() {
    window.removeEventListener('beforeunload', this.beforeUnload);
    window.removeEventListener('resize', this.onWindowResize);
  }

  onWindowResize() {
    // Trigger editor to re-render on window resizing.
    this.setState({ editorHeight: this.getEditorHeight() });
  }

  getEditorHeight(windowHeight) {
    const windowNonEditorHeight = 231 + (this.props.showConsole * (this.consoleHeight + 40));
    return `${String(windowHeight - windowNonEditorHeight)}px`;
  }

  beforeUnload(event) {
    // If there are unsaved changes and the user tries to close Dawn,
    // check if they want to save their changes first.
    if (this.hasUnsavedChanges()) {
      const clickedId = dialog.showMessageBox(currentWindow, {
        type: 'warning',
        buttons: ['Save...', 'Don\'t Save', 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        title: 'You have unsaved changes!',
        message: 'Do you want to save the changes made to your program?',
        detail: 'Your changes will be lost if you don\'t save them.',
      });

      // NOTE: For whatever reason, `event.preventDefault()` does not work within
      // beforeunload events, so we use `event.returnValue = false` instead.
      //
      // `clickedId` is the index of the clicked button in the button list above.
      if (clickedId === 0) {
        // FIXME: Figure out a way to make Save and Close, well, close.
        event.returnValue = false;
        this.props.onSaveFile();
      } else if (clickedId === 2) {
        event.returnValue = false;
      }
    }
  }

  toggleConsole() {
    this.props.toggleConsole();
    // Resize since the console overlaps with the editor, but enough time for console changes
    setTimeout(() => this.CodeEditor.editor.resize(), 0.1);
  }

  upload() {
    const filepath = this.props.filepath;
    if (filepath === null) {
      this.props.onAlertAdd(
        'Not Working on a File',
        'Please save first',
      );
      console.log('Upload: Not Working on File');
      return;
    }
    if (Editor.correctText(this.props.editorCode) !== this.props.editorCode) {
      this.props.onAlertAdd(
        'Invalid characters detected',
        'Your code has non-ASCII characters, which won\'t work on the robot. ' +
        'Please remove them and try again.',
      );
      console.log('Upload: Non-ASCII Issue');
      return;
    }
    const conn = new Client();
    conn.on('error', (err) => {
      this.props.onAlertAdd(
        'Upload Issue',
        'Robot could not be connected',
      );
      throw err;
    });
    ipcRenderer.send('NOTIFY_UPLOAD');
    const waiting = () => {
      let count = 0;
      const waitPromise = (resolve, reject) => {
        if (this.props.notificationHold === uploadStatus.RECEIVED) {
          resolve();
        } else if (this.props.notificationHold === uploadStatus.ERROR || count === 3) {
          reject();
        } else {
          count += 1;
          setTimeout(waitPromise.bind(this, resolve, reject), 2000);
        }
      };
      return new Promise(waitPromise);
    };
    const waitForRuntime = waiting();
    waitForRuntime.then(() => {
      conn.on('ready', () => {
        conn.sftp((err, sftp) => {
          if (err) {
            this.props.onAlertAdd(
              'Upload Issue',
              'SFTP session could not be initiated',
            );
            throw err;
          }
          sftp.fastPut(filepath, './PieCentral/runtime/testy/studentCode.py', (err2) => {
            conn.end();
            if (err2) {
              this.props.onAlertAdd(
                'Upload Issue',
                'File failed to be transmitted',
              );
              throw err2;
            }
          });
        });
      }).connect({
        debug: (input) => { console.log(input); },
        host: this.props.ipAddress,
        port: defaults.PORT,
        username: defaults.USERNAME,
        password: defaults.PASSWORD,
      });
    }, () => {
      conn.end();
      this.props.onNotifyChange(0);
      this.props.onAlertAdd(
        'Upload Issue',
        'Runtime unresponsive',
      );
    });
  }

  startRobot() {
    this.props.onUpdateCodeStatus(robotState.TELEOP);
    this.props.onClearConsole();
  }

  stopRobot() {
    this.props.onUpdateCodeStatus(robotState.IDLE);
  }

  estop() {
    this.props.onUpdateCodeStatus(robotState.ESTOP);
  }

  hasUnsavedChanges() {
    return (this.props.latestSaveCode !== this.props.editorCode);
  }

  changeTheme(theme) {
    this.props.onChangeTheme(theme);
    storage.set('editorTheme', { theme }, (err) => {
      if (err) throw err;
    });
  }

  increaseFontsize() {
    this.props.onChangeFontsize(this.props.fontSize + 1);
    storage.set('editorFontSize', { editorFontSize: this.props.fontSize + 1 }, (err) => {
      if (err) throw err;
    });
  }

  decreaseFontsize() {
    this.props.onChangeFontsize(this.props.fontSize - 1);
    storage.set('editorFontSize', { editorFontSize: this.props.fontSize - 1 }, (err) => {
      if (err) throw err;
    });
  }

  render() {
    const changeMarker = this.hasUnsavedChanges() ? '*' : '';
    return (
      <Panel
        bsStyle="primary"
        header={
          <span style={{ fontSize: '14px' }}>
            Editing: {pathToName(this.props.filepath) ? pathToName(this.props.filepath) : '[ New File ]' } {changeMarker}
          </span>
        }
      >
        <ButtonToolbar>
          <ButtonGroup id="file-operations-buttons">
            <TooltipButton
              id="new"
              text="New"
              onClick={this.props.onCreateNewFile}
              glyph="file"
            />
            <TooltipButton
              id="open"
              text="Open"
              onClick={this.props.onOpenFile}
              glyph="folder-open"
            />
            <TooltipButton
              id="save"
              text="Save"
              onClick={this.props.onSaveFile}
              glyph="floppy-disk"
            />
            <TooltipButton
              id="save-as"
              text="Save As"
              onClick={_.partial(this.props.onSaveFile, true)}
              glyph="floppy-save"
            />
          </ButtonGroup>
          <ButtonGroup id="code-execution-buttons">
            <TooltipButton
              id="run"
              text="Run"
              onClick={this.startRobot}
              glyph="play"
              disabled={this.props.isRunningCode || !this.props.runtimeStatus}
            />
            <TooltipButton
              id="stop"
              text="Stop"
              onClick={this.stopRobot}
              glyph="stop"
              disabled={!(this.props.isRunningCode && this.props.runtimeStatus)}
            />
            <TooltipButton
              id="upload"
              text="Upload"
              onClick={this.upload}
              glyph="upload"
              // disabled={this.props.isRunningCode || !this.props.runtimeStatus}
            />
            <TooltipButton
              id="e-stop"
              text="E-STOP"
              onClick={this.estop}
              glyph="fire"
            />
          </ButtonGroup>
          <ButtonGroup id="console-buttons">
            <TooltipButton
              id="toggle-console"
              text="Toggle Console"
              onClick={this.toggleConsole}
              glyph="console"
            />
            <TooltipButton
              id="clear-console"
              text="Clear Console"
              onClick={this.props.onClearConsole}
              glyph="remove"
            />
          </ButtonGroup>
          <ButtonGroup id="editor-settings-buttons">
            <TooltipButton
              id="increase-font-size"
              text="Increase font size"
              onClick={this.increaseFontsize}
              glyph="zoom-in"
              disabled={this.props.fontSize > 28}
            />
            <TooltipButton
              id="decrease-font-size"
              text="Decrease font size"
              onClick={this.decreaseFontsize}
              glyph="zoom-out"
              disabled={this.props.fontSize < 7}
            />
            <DropdownButton
              title="Theme"
              bsSize="small"
              id="choose-theme"
            >
              {this.themes.map(theme => (
                <MenuItem
                  active={theme === this.props.editorTheme}
                  onClick={_.partial(this.changeTheme, theme)}
                  key={theme}
                >
                  {theme}
                </MenuItem>
              ))}
            </DropdownButton>
          </ButtonGroup>
        </ButtonToolbar>
        <AceEditor
          mode="python"
          theme={this.props.editorTheme}
          width="100%"
          fontSize={this.props.fontSize}
          ref={(input) => { this.CodeEditor = input; }}
          name="CodeEditor"
          height={this.getEditorHeight(window.innerHeight)}
          value={this.props.editorCode}
          onChange={this.props.onEditorUpdate}
          onPaste={Editor.onEditorPaste}
          editorProps={{ $blockScrolling: Infinity }}
        />
        <ConsoleOutput
          toggleConsole={this.toggleConsole}
          show={this.props.showConsole}
          height={this.consoleHeight}
          output={this.props.consoleData}
        />
      </Panel>
    );
  }
}

Editor.propTypes = {
  editorCode: React.PropTypes.string,
  editorTheme: React.PropTypes.string,
  filepath: React.PropTypes.string,
  fontSize: React.PropTypes.number,
  latestSaveCode: React.PropTypes.string,
  showConsole: React.PropTypes.bool,
  consoleData: React.PropTypes.array,
  onAlertAdd: React.PropTypes.func,
  onEditorUpdate: React.PropTypes.func,
  onSaveFile: React.PropTypes.func,
  onOpenFile: React.PropTypes.func,
  onCreateNewFile: React.PropTypes.func,
  onChangeTheme: React.PropTypes.func,
  onChangeFontsize: React.PropTypes.func,
  toggleConsole: React.PropTypes.func,
  onClearConsole: React.PropTypes.func,
  onUpdateCodeStatus: React.PropTypes.func,
  isRunningCode: React.PropTypes.bool,
  runtimeStatus: React.PropTypes.bool,
  ipAddress: React.PropTypes.string,
  notificationHold: React.PropTypes.number,
  onNotifyChange: React.PropTypes.func,
};

export default Editor;
