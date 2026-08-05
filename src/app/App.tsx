import { lazy, Suspense, useEffect } from 'react';
import { MainLauncher } from '../components/MainLauncher';
import { ShortcutSettingsWindow } from '../components/ShortcutSettingsPopover';

const CommandManagerWindow = lazy(() =>
  import('../components/CommandManagerWindow').then((module) => ({ default: module.CommandManagerWindow })),
);

const view = new URLSearchParams(window.location.search).get('view');

export function App() {
  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    document.addEventListener('contextmenu', handleContextMenu, true);
    return () => document.removeEventListener('contextmenu', handleContextMenu, true);
  }, []);

  if (view === 'manager') {
    return <Suspense fallback={<WindowLoading />}> <CommandManagerWindow /> </Suspense>;
  }
  if (view === 'shortcut-settings') {
    return <ShortcutSettingsWindow />;
  }
  return <MainLauncher />;
}

function WindowLoading() {
  return <main className="flex min-h-screen items-center justify-center bg-background text-xs text-muted-foreground">正在打开窗口…</main>;
}
