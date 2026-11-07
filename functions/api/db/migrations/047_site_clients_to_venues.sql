-- Every client card on the landing page becomes a real venue; the page then builds every tile from venues.
-- One row per old hand-made card (lib/siteClients.mjs), minus Shanghai, which already exists as a venue.
-- A venue already holding the card's slug is left alone; an unlinked venue with the same name is linked and only
-- its empty website fields are filled; every other card becomes a new active venue on the website.
CREATE TEMP TABLE site_seed (slug text, name text, city text, blurb text, url text) ON COMMIT DROP;
INSERT INTO site_seed (slug, name, city, blurb, url) VALUES
  ('angels-share', 'Angels Share', 'Edinburgh', 'Door supervision and venue security for a celebrated whisky bar.', 'https://angelssharehotel.com/'),
  ('bar-50', 'Bar 50', 'Edinburgh', 'Reliable security cover for a vibrant city-centre social hub.', 'https://pugmanmedia.co.uk/pugman-links/bar-50/'),
  ('bar-napoli', 'Bar Napoli', 'Edinburgh', 'Discreet security for an authentic Italian dining venue.', 'https://barnapoli.co.uk/'),
  ('bbar', 'Bbar', 'Edinburgh', 'Tailored door supervision for a stylish late-night cocktail bar.', 'https://www.b-baredinburgh.co.uk'),
  ('biblos', 'Biblos', 'Edinburgh', 'Trusted security presence for a long-standing bar and restaurant.', 'https://www.biblosedinburgh.co.uk/'),
  ('black-rose', 'Black Rose', 'Edinburgh', 'Dedicated security for a premier hospitality venue.', 'https://www.blackrosetavern.com/'),
  ('evergreen', 'Evergreen', 'Edinburgh', 'Attentive security cover for a refined hospitality venue.', 'https://evergreenbars.com/'),
  ('frankenstein', 'Frankenstein', 'Edinburgh', 'Door supervision and crowd management for a renowned themed venue.', 'https://frankensteinedinburgh.co.uk/'),
  ('garibaldis', 'Garibaldis', 'Edinburgh', 'Discreet security for an established restaurant and bar.', 'https://www.garibaldisplaza.com/'),
  ('grand-cru', 'Grand Cru', 'Edinburgh', 'Comprehensive security for a luxury dining establishment.', 'https://grandcrubar.co.uk/'),
  ('harvey-nichols', 'Harvey Nichols', 'Edinburgh', 'Manned guarding and loss prevention for a prestigious retail destination.', 'https://www.harveynichols.com/store/edinburgh'),
  ('hoxton', 'Hoxton', 'Edinburgh', '24/7 security and access control for a boutique hotel.', 'https://thehoxton.com/edinburgh/'),
  ('le-monde', 'Le Monde', 'Edinburgh', 'Integrated security for a stylish boutique hotel and bar.', 'https://lemondehotel.co.uk/'),
  ('new-eidyn', 'New Eidyn', 'Edinburgh', 'Premium security for a flagship luxury retail and hospitality district.', 'https://www.neweidyn.com/'),
  ('pilgrim', 'Pilgrim', 'Edinburgh', 'Door supervision and venue protection for a lively neighbourhood bar.', 'https://www.pilgrimbar.co.uk/'),
  ('the-royal-yacht-britannia', 'The Royal Yacht Britannia', 'Edinburgh', 'Bespoke event security for a world-famous heritage attraction.', 'https://www.royalyachtbritannia.co.uk/'),
  ('w-hotel', 'W Hotel', 'Edinburgh', 'Premium security for a world-renowned luxury hotel.', 'https://www.marriott.com/en-us/hotels/ediwh-w-edinburgh/'),
  ('shilling-brewing-co', 'Shilling Brewing Co.', 'Glasgow', 'Reliable cover for a popular city-centre brewery and taproom.', 'https://shillingbrewingcompany.co.uk/'),
  ('vega-glasgow', 'Vega Glasgow', 'Glasgow', 'Crowd management and door supervision for a leading nightlife venue.', 'https://vegaglasgow.com/'),
  ('yotel-glasgow', 'Yotel Glasgow', 'Glasgow', 'Integrated security for a modern city-centre hotel.', 'https://www.yotel.com/en/hotels/yotel-glasgow'),
  ('carbon-lounge', 'Carbon Lounge', NULL, 'Professional door staff and crowd management for a contemporary lounge.', NULL),
  ('days-festival', 'Days Festival', NULL, 'Event security and crowd control for a major outdoor festival.', NULL)
;

UPDATE venues v SET site_client = m.slug,
       city = COALESCE(v.city, m.city),
       website_blurb = COALESCE(NULLIF(btrim(v.website_blurb), ''), m.blurb),
       website_url = COALESCE(NULLIF(btrim(v.website_url), ''), m.url),
       website_photo_url = CASE WHEN v.photo_key IS NULL THEN COALESCE(v.website_photo_url, '/img/opulence/clients/' || m.slug || '-960.jpg') ELSE v.website_photo_url END
  FROM (SELECT DISTINCT ON (s.slug) s.*, x.id AS venue_id
          FROM site_seed s JOIN venues x ON lower(btrim(x.name)) = lower(s.name) AND x.site_client IS NULL
         WHERE NOT EXISTS (SELECT 1 FROM venues y WHERE y.site_client = s.slug)
         ORDER BY s.slug, x.active DESC, x.created_at) m
 WHERE v.id = m.venue_id;

INSERT INTO venues (name, site_client, active, on_website, city, website_blurb, website_url, website_photo_url)
SELECT s.name, s.slug, true, true, s.city, s.blurb, s.url, '/img/opulence/clients/' || s.slug || '-960.jpg'
  FROM site_seed s
 WHERE NOT EXISTS (SELECT 1 FROM venues y WHERE y.site_client = s.slug)
   AND NOT EXISTS (SELECT 1 FROM venues y WHERE lower(btrim(y.name)) = lower(s.name));
