// The old hand-made client cards of the public website. Each is now a venue (migration 047 seeded them, minus
// Shanghai, which already existed) and the landing page builds every tile from venues. The slugs stay as review
// keys: reviews are filed against them and a venue's site_client links it to its old card's reviews and photo.
// file: the photo's name in the original image set, used by scripts/site-images.sh.
export const SITE_CLIENTS = [
  { slug: 'angels-share', name: 'Angels Share', city: 'Edinburgh', file: 'Angels Share.jpg', url: 'https://angelssharehotel.com/', blurb: 'Door supervision and venue security for a celebrated whisky bar.' },
  { slug: 'bar-50', name: 'Bar 50', city: 'Edinburgh', file: 'Bar 50.webp', url: 'https://pugmanmedia.co.uk/pugman-links/bar-50/', blurb: 'Reliable security cover for a vibrant city-centre social hub.' },
  { slug: 'bar-napoli', name: 'Bar Napoli', city: 'Edinburgh', file: 'Bar Napoli.jpg', url: 'https://barnapoli.co.uk/', blurb: 'Discreet security for an authentic Italian dining venue.' },
  { slug: 'bbar', name: 'Bbar', city: 'Edinburgh', file: 'Bbar.jpg', url: 'https://www.b-baredinburgh.co.uk', blurb: 'Tailored door supervision for a stylish late-night cocktail bar.' },
  { slug: 'biblos', name: 'Biblos', city: 'Edinburgh', file: 'Biblos.jpg', url: 'https://www.biblosedinburgh.co.uk/', blurb: 'Trusted security presence for a long-standing bar and restaurant.' },
  { slug: 'black-rose', name: 'Black Rose', city: 'Edinburgh', file: 'black-rose.jpg', url: 'https://www.blackrosetavern.com/', blurb: 'Dedicated security for a premier hospitality venue.' },
  { slug: 'evergreen', name: 'Evergreen', city: 'Edinburgh', file: 'Evergreen.jpg', url: 'https://evergreenbars.com/', blurb: 'Attentive security cover for a refined hospitality venue.' },
  { slug: 'frankenstein', name: 'Frankenstein', city: 'Edinburgh', file: 'Frankenstein.jpg', url: 'https://frankensteinedinburgh.co.uk/', blurb: 'Door supervision and crowd management for a renowned themed venue.' },
  { slug: 'garibaldis', name: 'Garibaldis', city: 'Edinburgh', file: 'Garibaldis.png', url: 'https://www.garibaldisplaza.com/', blurb: 'Discreet security for an established restaurant and bar.' },
  { slug: 'grand-cru', name: 'Grand Cru', city: 'Edinburgh', file: 'Grand Cru.webp', url: 'https://grandcrubar.co.uk/', blurb: 'Comprehensive security for a luxury dining establishment.' },
  { slug: 'harvey-nichols', name: 'Harvey Nichols', city: 'Edinburgh', file: 'harvey nichols.webp', url: 'https://www.harveynichols.com/store/edinburgh', blurb: 'Manned guarding and loss prevention for a prestigious retail destination.' },
  { slug: 'hoxton', name: 'Hoxton', city: 'Edinburgh', file: 'hoxton.jpg', url: 'https://thehoxton.com/edinburgh/', blurb: '24/7 security and access control for a boutique hotel.' },
  { slug: 'le-monde', name: 'Le Monde', city: 'Edinburgh', file: 'Le Monde.jpg', url: 'https://lemondehotel.co.uk/', blurb: 'Integrated security for a stylish boutique hotel and bar.' },
  { slug: 'new-eidyn', name: 'New Eidyn', city: 'Edinburgh', file: 'New Eidyn.jpg', url: 'https://www.neweidyn.com/', blurb: 'Premium security for a flagship luxury retail and hospitality district.' },
  { slug: 'pilgrim', name: 'Pilgrim', city: 'Edinburgh', file: 'Pilgrim.jpg', url: 'https://www.pilgrimbar.co.uk/', blurb: 'Door supervision and venue protection for a lively neighbourhood bar.' },
  { slug: 'shanghai', name: 'Shanghai', city: 'Edinburgh', file: 'Shanghai.jpg', url: 'https://shanghaiclub.co.uk/', blurb: 'Event security and venue protection for an iconic establishment.' },
  { slug: 'the-royal-yacht-britannia', name: 'The Royal Yacht Britannia', city: 'Edinburgh', file: 'The Royal Yacht Britannia.jpg', url: 'https://www.royalyachtbritannia.co.uk/', blurb: 'Bespoke event security for a world-famous heritage attraction.' },
  { slug: 'w-hotel', name: 'W Hotel', city: 'Edinburgh', file: 'W Hotel.webp', url: 'https://www.marriott.com/en-us/hotels/ediwh-w-edinburgh/', blurb: 'Premium security for a world-renowned luxury hotel.' },
  { slug: 'shilling-brewing-co', name: 'Shilling Brewing Co.', city: 'Glasgow', file: 'Shiling Brewing Co..jpg', url: 'https://shillingbrewingcompany.co.uk/', blurb: 'Reliable cover for a popular city-centre brewery and taproom.' },
  { slug: 'vega-glasgow', name: 'Vega Glasgow', city: 'Glasgow', file: 'Vega Glasgow.jpg', url: 'https://vegaglasgow.com/', blurb: 'Crowd management and door supervision for a leading nightlife venue.' },
  { slug: 'yotel-glasgow', name: 'Yotel Glasgow', city: 'Glasgow', file: 'yotl glasgow.jpg', url: 'https://www.yotel.com/en/hotels/yotel-glasgow', blurb: 'Integrated security for a modern city-centre hotel.' },
  { slug: 'carbon-lounge', name: 'Carbon Lounge', city: 'Scotland', file: 'Carbon Lounge.jpg', url: '', blurb: 'Professional door staff and crowd management for a contemporary lounge.' },
  { slug: 'days-festival', name: 'Days Festival', city: 'Scotland', file: 'Days Festival.jpg', url: '', blurb: 'Event security and crowd control for a major outdoor festival.' },
];

export const isSiteClient = (s) => SITE_CLIENTS.some((c) => c.slug === s);
