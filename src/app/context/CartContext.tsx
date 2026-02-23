"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Cart, Service, Venue } from '../types/cart';

type CartContextValue = {
  cart: Cart;
  setVenue: (venue: Venue) => void;
  clearVenue: () => void;
  toggleService: (service: Service) => void;
  updateServiceDate: (serviceId: string, serviceDate: string) => void;
  removeService: (serviceId: string) => void;
  clearCart: () => void;
  total: number;
  hasService: (serviceId: string) => boolean;
};

const CART_STORAGE_KEY = 'event_marketplace_cart_v1';

const defaultCart: Cart = {
  venue: null,
  services: [],
  currency: 'eur',
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<Cart>(defaultCart);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Cart;
      const validServices = Array.isArray(parsed?.services)
        ? parsed.services
            .filter((s) => s && typeof s.id === 'string' && Number.isFinite(s.price))
            .map((s) => ({
              ...s,
              serviceDate: typeof s.serviceDate === 'string' ? s.serviceDate : '',
            }))
        : [];
      const nextCart: Cart = {
        venue:
          parsed?.venue && typeof parsed.venue.id === 'string' && Number.isFinite(parsed.venue.price)
            ? parsed.venue
            : null,
        services: validServices,
        currency: 'eur',
      };
      setCart(nextCart);
    } catch {
      // Ignore invalid cart payload.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // Ignore storage errors.
    }
  }, [cart]);

  const total = useMemo(() => {
    const venueTotal = cart.venue?.price ?? 0;
    const servicesTotal = cart.services.reduce((sum, s) => sum + s.price, 0);
    return venueTotal + servicesTotal;
  }, [cart]);

  const hasService = (serviceId: string) => cart.services.some((s) => s.id === serviceId);

  const setVenue = (venue: Venue) => {
    setCart((prev) => ({ ...prev, venue }));
  };

  const clearVenue = () => {
    setCart((prev) => ({ ...prev, venue: null }));
  };

  const toggleService = (service: Service) => {
    setCart((prev) => {
      const exists = prev.services.some((s) => s.id === service.id);
      return {
        ...prev,
        services: exists
          ? prev.services.filter((s) => s.id !== service.id)
          : [...prev.services, service],
      };
    });
  };

  const removeService = (serviceId: string) => {
    setCart((prev) => ({
      ...prev,
      services: prev.services.filter((s) => s.id !== serviceId),
    }));
  };

  const updateServiceDate = (serviceId: string, serviceDate: string) => {
    setCart((prev) => ({
      ...prev,
      services: prev.services.map((service) => (
        service.id === serviceId
          ? { ...service, serviceDate }
          : service
      )),
    }));
  };

  const clearCart = () => setCart(defaultCart);

  return (
    <CartContext.Provider
      value={{
        cart,
        setVenue,
        clearVenue,
        toggleService,
        updateServiceDate,
        removeService,
        clearCart,
        total,
        hasService,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider />');
  return ctx;
}
