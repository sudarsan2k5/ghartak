import { Boxes, LayoutDashboard, Package, Settings, Shapes, ShoppingBag, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: "/overview" | "/orders" | "/products" | "/categories" | "/inventory" | "/settings";
  label: string;
  icon: LucideIcon;
};

export const navItems: readonly NavItem[] = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: ShoppingBag },
  { href: "/products", label: "Products", icon: Package },
  { href: "/categories", label: "Categories", icon: Shapes },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function titleForPath(pathname: string): string {
  if (/^\/orders\/[^/]+$/.test(pathname)) {
    return "Order";
  }
  if (pathname.startsWith("/products/new")) {
    return "Add product";
  }
  if (/^\/products\/[^/]+\/edit$/.test(pathname)) {
    return "Edit product";
  }
  if (/^\/products\/[^/]+$/.test(pathname)) {
    return "Product";
  }
  const match = navItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  return match?.label ?? "Admin";
}
