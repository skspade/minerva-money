import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router';
import { Drawer } from 'vaul';
import { CreditCard, Tag, Sliders, ArrowLeftRight, BarChart, Upload } from 'lucide-react';

const MORE_LINKS = [
  { to: '/accounts', icon: CreditCard, label: 'Accounts' },
  { to: '/categories', icon: Tag, label: 'Categories' },
  { to: '/rules', icon: Sliders, label: 'Rules' },
  { to: '/transfers', icon: ArrowLeftRight, label: 'Transfers' },
  { to: '/reports', icon: BarChart, label: 'Reports' },
  { to: '/import', icon: Upload, label: 'Import' },
] as const;

interface MoreSheetProps {
  open: boolean;
  onClose: () => void;
}

export default function MoreSheet({ open, onClose }: MoreSheetProps) {
  const location = useLocation();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    onClose();
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Drawer.Content className="fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-2xl pb-safe">
          <div className="mx-auto w-12 h-1.5 bg-gray-300 rounded-full mt-3 mb-4" />
          <nav className="px-4 pb-6 space-y-1">
            {MORE_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className="flex items-center gap-3 px-3 min-h-[44px] rounded-lg text-gray-700 hover:bg-gray-100"
              >
                <link.icon size={20} />
                <span className="text-base font-medium">{link.label}</span>
              </NavLink>
            ))}
          </nav>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
