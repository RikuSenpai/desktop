import { ipcRenderer, remote } from 'electron';
import { observable, computed } from 'mobx';
import { getTheme } from '~/utils/themes';
import { ISettings } from '~/interfaces';
import { DEFAULT_SETTINGS } from '~/constants';
import * as React from 'react';
import { Textfield } from '~/renderer/components/Textfield';

export class Store {
  @observable
  public settings: ISettings = DEFAULT_SETTINGS;

  @computed
  public get theme() {
    return getTheme(this.settings.theme);
  }

  @observable
  public visible = false;

  @observable
  public id = remote.getCurrentWebContents().id;

  @observable
  public windowId = remote.getCurrentWindow().id;

  public inputRef = React.createRef<Textfield>();

  public tabGroupId: number;

  public constructor() {
    ipcRenderer.on('visible', (e, flag, tabGroup) => {
      this.visible = flag;

      if (flag) {
        this.tabGroupId = tabGroup.id;
        this.inputRef.current.inputRef.current.focus();
        this.inputRef.current.inputRef.current.value = tabGroup.name;
        this.inputRef.current.inputRef.current.select();
      }
    });

    window.addEventListener('blur', () => {
      if (this.visible) {
        setTimeout(() => {
          this.hide();
        });
      }
    });

    ipcRenderer.send('get-settings');

    ipcRenderer.on('update-settings', (e, settings: ISettings) => {
      this.settings = { ...this.settings, ...settings };
    });
  }

  public hide() {
    ipcRenderer.send(`hide-${this.id}`);
  }
}

export default new Store();
