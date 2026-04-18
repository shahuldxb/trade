import useBodyClasses from '@/hooks/useBodyClasses';
import { Demo1LayoutProvider, Main } from './';
import { useHealthCheck } from '@/hooks/useHealthCheck';
const Demo1Layout = () => {
  // Using the useBodyClasses hook to set background styles for light and dark modes
  useHealthCheck();
  useBodyClasses(`
    [--tw-page-bg:#fefefe]
    [--tw-page-bg-dark:var(--tw-coal-500)]
    demo1 
    sidebar-fixed 
    header-fixed 
    bg-[--tw-page-bg]
    dark:bg-[--tw-page-bg-dark]
  `);

  return (
    <Demo1LayoutProvider>
      <Main />
    </Demo1LayoutProvider>
  );
};

export { Demo1Layout };
