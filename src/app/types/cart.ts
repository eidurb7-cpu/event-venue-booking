import type { Venue as VenueData } from '../data/mockData';

export type Venue = {
  id: string;
  title: string;
  price: number;
  image?: string;
  location?: string;
};

export type Service = {
  id: string;
  title: string;
  price: number;
  category?: string;
  serviceId?: string;
  providerId?: string;
};

export type Cart = {
  venue: Venue | null;
  services: Service[];
  currency: 'eur';
};

export function toCartVenue(venue: VenueData): Venue {
  return {
    id: venue.id,
    title: venue.name,
    price: venue.price,
    image: venue.image,
    location: venue.location,
  };
}
