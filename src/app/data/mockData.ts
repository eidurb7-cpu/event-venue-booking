export interface Venue {
  id: string;
  name: string;
  description: string;
  image: string;
  capacity: number;
  price: number;
  location: string;
  features: string[];
  type: string;
  bookedDates: string[]; // Array of booked dates in YYYY-MM-DD format
}

export interface ServiceProvider {
  id: string;
  name: string;
  rating: number;
  reviewCount: number;
  specialties: string[];
  price: number;
  image?: string;
  bookedDates: string[]; // Array of booked dates in YYYY-MM-DD format
}

export interface Service {
  id: string;
  name: string;
  description: string;
  image: string;
  price: number;
  category: 'dj' | 'catering' | 'makeup' | 'decorations' | 'photography';
  providers: ServiceProvider[];
}

export const venues: Venue[] = [
  {
    id: '1',
    name: 'Grosser Ballsaal',
    description: 'Eleganter Ballsaal, ideal fuer Hochzeiten und Firmenevents',
    image: 'https://images.unsplash.com/photo-1759519238029-689e99c6d19e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBldmVudCUyMHZlbnVlJTIwYmFsbHJvb218ZW58MXx8fHwxNzcxMDE2OTcyfDA&ixlib=rb-4.1.0&q=80&w=1080',
    capacity: 300,
    price: 5000,
    location: 'Innenstadt',
    features: ['Klimaanlage', 'Buehne', 'Soundsystem', 'Parkplaetze', 'WLAN'],
    type: 'Ballsaal',
    bookedDates: ['2026-02-20', '2026-02-27', '2026-03-15']
  },
  {
    id: '2',
    name: 'Gartenparadies',
    description: 'Wunderschoene Outdoor-Location mit natuerlicher Kulisse',
    image: 'https://images.unsplash.com/photo-1762216444919-043cf813e4de?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxvdXRkb29yJTIwZ2FyZGVuJTIwd2VkZGluZyUyMHZlbnVlfGVufDF8fHx8MTc3MTAwNjg2N3ww&ixlib=rb-4.1.0&q=80&w=1080',
    capacity: 200,
    price: 3500,
    location: 'Nordstadt',
    features: ['Aussenbereich', 'Garten', 'Pavillon', 'Beleuchtung', 'Parkplaetze'],
    type: 'Garten',
    bookedDates: ['2026-02-21', '2026-03-01', '2026-03-08']
  },
  {
    id: '3',
    name: 'Moderner Konferenzsaal',
    description: 'Moderner Veranstaltungsraum fuer Firmenevents und Konferenzen',
    image: 'https://images.unsplash.com/photo-1703355685952-03ed19f70f51?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBjb25mZXJlbmNlJTIwaGFsbHxlbnwxfHx8fDE3NzA5NjE4MTN8MA&ixlib=rb-4.1.0&q=80&w=1080',
    capacity: 150,
    price: 2500,
    location: 'Geschaeftsviertel',
    features: ['Projektor', 'WLAN', 'Klimaanlage', 'Catering-Kueche', 'Parkplaetze'],
    type: 'Konferenzsaal',
    bookedDates: ['2026-02-18', '2026-02-25', '2026-03-04']
  },
  {
    id: '4',
    name: 'Skyline Dachterrasse',
    description: 'Beeindruckende Dachterrassen-Location mit Panoramablick',
    image: 'https://images.unsplash.com/photo-1746021425981-5f55202a826d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxyb29mdG9wJTIwZXZlbnQlMjBzcGFjZXxlbnwxfHx8fDE3NzEwMTY5NzN8MA&ixlib=rb-4.1.0&q=80&w=1080',
    capacity: 120,
    price: 4000,
    location: 'Stadtzentrum',
    features: ['Stadtblick', 'Barbereich', 'Lounge', 'Beleuchtung', 'Klimasteuerung'],
    type: 'Dachterrasse',
    bookedDates: ['2026-02-22', '2026-03-07', '2026-03-14']
  }
];

export const services: Service[] = [
  {
    id: 'dj',
    name: 'DJ Services',
    description: 'Professionelle DJs fuer eine starke Event-Stimmung',
    image: 'https://images.unsplash.com/photo-1766111242568-d935ea63f32f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxESiUyMHR1cm50YWJsZXMlMjBwYXJ0eXxlbnwxfHx8fDE3NzEwMTY5NzN8MA&ixlib=rb-4.1.0&q=80&w=1080',
    price: 800,
    category: 'dj',
    providers: [
      {
        id: 'dj-1',
        name: 'DJ Marcus "The Mixer"',
        rating: 4.9,
        reviewCount: 127,
        specialties: ['Hochzeiten', 'Firmenevents', 'EDM', 'Top 40'],
        price: 800,
        bookedDates: ['2026-02-20', '2026-02-27', '2026-03-06']
      },
      {
        id: 'dj-2',
        name: 'DJ Sarah Beats',
        rating: 4.8,
        reviewCount: 95,
        specialties: ['Hochzeiten', 'Private Feiern', 'Hip Hop', 'R&B'],
        price: 1200,
        bookedDates: ['2026-02-21', '2026-02-28', '2026-03-15']
      },
      {
        id: 'dj-3',
        name: 'DJ Alex Sound',
        rating: 4.7,
        reviewCount: 83,
        specialties: ['Business', 'Jazz', 'Lounge', 'Klassik'],
        price: 950,
        bookedDates: ['2026-02-19', '2026-03-01', '2026-03-08']
      }
    ]
  },
  {
    id: 'catering',
    name: 'Catering',
    description: 'Leckere Speisen und Getraenke fuer jedes Event',
    image: 'https://images.unsplash.com/photo-1732259495388-af40b972c311?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjYXRlcmluZyUyMGZvb2QlMjBzZXJ2aWNlfGVufDF8fHx8MTc3MTAxNjk3M3ww&ixlib=rb-4.1.0&q=80&w=1080',
    price: 50,
    category: 'catering',
    providers: [
      {
        id: 'catering-1',
        name: 'Gourmet Delights Catering',
        rating: 4.9,
        reviewCount: 156,
        specialties: ['Italienisch', 'Franzoesisch', 'Fusion', 'Vegetarisch'],
        price: 85,
        bookedDates: ['2026-02-20', '2026-02-27', '2026-03-07']
      },
      {
        id: 'catering-2',
        name: 'Taste of Asia Catering',
        rating: 4.8,
        reviewCount: 132,
        specialties: ['Asiatisch', 'Sushi', 'Thai', 'Chinesisch'],
        price: 75,
        bookedDates: ['2026-02-22', '2026-03-01', '2026-03-15']
      },
      {
        id: 'catering-3',
        name: 'Classic Cuisine Co.',
        rating: 4.7,
        reviewCount: 98,
        specialties: ['Amerikanisch', 'BBQ', 'Hausmannskost', 'Buffet'],
        price: 65,
        bookedDates: ['2026-02-21', '2026-02-28', '2026-03-08']
      },
      {
        id: 'catering-4',
        name: 'Elegant Events Catering',
        rating: 5.0,
        reviewCount: 87,
        specialties: ['Fine Dining', 'Molekularkueche', 'Weinbegleitung'],
        price: 120,
        bookedDates: ['2026-02-19', '2026-03-06', '2026-03-14']
      }
    ]
  },
  {
    id: 'decorations',
    name: 'Dekoration',
    description: 'Stilvolle Dekoration fuer eine besondere Atmosphaere',
    image: 'https://images.unsplash.com/photo-1563292749-ec3b11277f72?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxldmVudCUyMGRlY29yYXRpb25zJTIwZmxvd2Vyc3xlbnwxfHx8fDE3NzEwMTY5NzR8MA&ixlib=rb-4.1.0&q=80&w=1080',
    price: 1000,
    category: 'decorations',
    providers: [
      {
        id: 'decor-1',
        name: 'Bloom & Bliss Decorations',
        rating: 4.9,
        reviewCount: 143,
        specialties: ['Blumenarrangements', 'Romantisch', 'Gartenthema', 'Boho'],
        price: 1500,
        bookedDates: ['2026-02-20', '2026-02-27', '2026-03-06']
      },
      {
        id: 'decor-2',
        name: 'Modern Touch Decor',
        rating: 4.8,
        reviewCount: 118,
        specialties: ['Modern', 'Minimalistisch', 'Industrial', 'Geometrisch'],
        price: 1200,
        bookedDates: ['2026-02-21', '2026-03-01', '2026-03-15']
      },
      {
        id: 'decor-3',
        name: 'Elegant Affairs',
        rating: 5.0,
        reviewCount: 96,
        specialties: ['Luxus', 'Klassisch', 'Kristall', 'Kronleuchter'],
        price: 2500,
        bookedDates: ['2026-02-22', '2026-02-28', '2026-03-08']
      }
    ]
  },
  {
    id: 'makeup',
    name: 'Make-up & Hair',
    description: 'Professionelles Make-up und Hairstyling fuer dein Event',
    image: 'https://images.unsplash.com/photo-1625139108082-48bb424c2333?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtYWtldXAlMjBhcnRpc3QlMjBicmlkZXxlbnwxfHx8fDE3NzEwMTY5NzN8MA&ixlib=rb-4.1.0&q=80&w=1080',
    price: 150,
    category: 'makeup',
    providers: [
      {
        id: 'makeup-1',
        name: 'Bella Beauty Studio',
        rating: 4.9,
        reviewCount: 201,
        specialties: ['Brautstyling', 'Airbrush', 'Natural Look', 'Vintage'],
        price: 150,
        bookedDates: ['2026-02-20', '2026-02-27', '2026-03-07']
      },
      {
        id: 'makeup-2',
        name: 'Glam Squad Pro',
        rating: 4.8,
        reviewCount: 167,
        specialties: ['Glamorous', 'Editorial', 'Party', 'Bold Looks'],
        price: 200,
        bookedDates: ['2026-02-21', '2026-03-01', '2026-03-08']
      },
      {
        id: 'makeup-3',
        name: 'Natural Radiance',
        rating: 4.7,
        reviewCount: 134,
        specialties: ['Natural', 'Bio-Produkte', 'Soft Glam', 'Minimalistisch'],
        price: 180,
        bookedDates: ['2026-02-22', '2026-02-28', '2026-03-15']
      }
    ]
  },
  {
    id: 'photography',
    name: 'Fotografie',
    description: 'Professionelle Fotografie, um besondere Momente festzuhalten',
    image: 'https://images.unsplash.com/photo-1759665996004-ff4c8f0745be?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3ZWRkaW5nJTIwcGhvdG9ncmFwaGVyJTIwY2FtZXJhfGVufDF8fHx8MTc3MDk0NTU2OXww&ixlib=rb-4.1.0&q=80&w=1080',
    price: 1500,
    category: 'photography',
    providers: [
      {
        id: 'photo-1',
        name: 'Timeless Moments Photography',
        rating: 5.0,
        reviewCount: 178,
        specialties: ['Hochzeiten', 'Portraets', 'Reportage', 'Cinematic'],
        price: 1500,
        bookedDates: ['2026-02-20', '2026-02-27', '2026-03-06']
      },
      {
        id: 'photo-2',
        name: 'Studio Flash Photography',
        rating: 4.9,
        reviewCount: 145,
        specialties: ['Business', 'Events', 'Produkte', 'Editorial'],
        price: 1200,
        bookedDates: ['2026-02-21', '2026-03-01', '2026-03-15']
      },
      {
        id: 'photo-3',
        name: 'Artisan Lens Co.',
        rating: 4.8,
        reviewCount: 129,
        specialties: ['Fine Art', 'Dokumentarisch', 'Kuenstlerisch', 'Schwarzweiss'],
        price: 1800,
        bookedDates: ['2026-02-19', '2026-02-28', '2026-03-08']
      },
      {
        id: 'photo-4',
        name: 'Modern Capture Studio',
        rating: 4.9,
        reviewCount: 112,
        specialties: ['Modern', 'Drohnenaufnahmen', 'Video', '360 Fotos'],
        price: 2000,
        bookedDates: ['2026-02-22', '2026-03-07', '2026-03-14']
      }
    ]
  }
];
