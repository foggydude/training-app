'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sidebar,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { LayoutGrid, Settings, PlusCircle, User } from 'lucide-react';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUser } from '@/firebase';

const menuItems = [
  { href: '/', label: 'Dashboard', icon: LayoutGrid },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useUser();

  if (!user) return null;

  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/" className="flex items-center gap-2">
          <Icons.logo className="h-8 w-8 text-primary" />
          <span className="text-lg font-semibold">Adaptive Planner</span>
        </Link>
      </SidebarHeader>

      <SidebarMenu className="flex-1">
        <SidebarMenuItem>
          <Button asChild className="w-full justify-start">
            <Link href="/races/new">
              <PlusCircle className="mr-2 h-4 w-4" />
              Create Race
            </Link>
          </Button>
        </SidebarMenuItem>
        {menuItems.map((item) => {
          const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <SidebarMenuItem key={item.label}>
              <SidebarMenuButton
                asChild
                variant={isActive ? 'default' : 'ghost'}
                className="w-full justify-start"
                isActive={isActive}
              >
                <Link href={item.href}>
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.label}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>

      <SidebarFooter>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start gap-2 px-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user.photoURL ?? ''} alt={user.displayName ?? ''} />
                <AvatarFallback>
                  {user.displayName?.charAt(0) ?? user.email?.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{user.displayName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">
                  {user.displayName}
                </p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" />
              <span>Profile</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
