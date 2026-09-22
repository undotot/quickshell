import { useEffect } from 'react';
import { CommandPalette } from '../components/CommandPalette';
import { SettingsWindow } from '../components/ShortcutSettingsPopover';

const view = new URLSearchParams(window.location.search).get('view');

export function App() {
  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    document.addEventListener('contextmenu', handleContextMenu, true);
    return () => document.removeEventListener('contextmenu', handleContextMenu, true);
  }, []);

  if (view === 'settings' || view === 'shortcut-settings') {
    return <SettingsWindow />;
  }
  return <CommandPalette />;
}
