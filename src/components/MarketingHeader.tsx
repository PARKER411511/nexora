"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const links = [
  { href: "/#product", label: "Product" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/#faq", label: "FAQ" },
];

export function MarketingHeader() {
  const [open, setOpen] = useState(false);

  function closeMenu() {
    setOpen(false);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenu();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="marketing-header-shell">
      <header className="site-header marketing-header">
        <Link className="brand" href="/" onClick={closeMenu}>
          <span aria-hidden="true" className="brand-mark">
            ✳
          </span>
          Nexora
        </Link>
        <nav aria-label="Main navigation" className="nav marketing-nav">
          {links.map((link) => (
            <Link href={link.href} key={link.href} onClick={closeMenu}>
              {link.label}
            </Link>
          ))}
          <Link href="/auth/sign-in" onClick={closeMenu}>
            Sign in
          </Link>
          <Link className="nav-cta" href="/auth/sign-up" onClick={closeMenu}>
            Create account
          </Link>
        </nav>
        <button
          aria-controls="mobile-marketing-nav"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className="mobile-menu-toggle"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          {open ? <X size={19} /> : <Menu size={19} />}
        </button>
        <nav
          aria-hidden={!open}
          aria-label="Mobile navigation"
          className="mobile-nav-panel"
          hidden={!open}
          id="mobile-marketing-nav"
        >
          {links.map((link) => (
            <Link href={link.href} key={link.href} onClick={closeMenu}>
              {link.label}
            </Link>
          ))}
          <Link className="button-secondary" href="/auth/sign-in" onClick={closeMenu}>
            Sign in
          </Link>
          <Link className="button-primary" href="/auth/sign-up" onClick={closeMenu}>
            Create account
          </Link>
        </nav>
      </header>
    </div>
  );
}
