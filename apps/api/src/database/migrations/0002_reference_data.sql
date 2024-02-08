-- Reference geography: the towns trucks check in at and the corridors they run.
-- Coordinates are town centres (WGS84). Corridor `route` is a polyline through the stops,
-- which is accurate enough for "is this load on the truck's way?" decisions (15 km tolerance).

INSERT INTO places (code, name, name_am, kind, region, location) VALUES
  ('ADD', 'Addis Ababa',   'አዲስ አበባ',   'city', 'Addis Ababa', ST_SetSRID(ST_MakePoint(38.7613,  9.0108), 4326)::geography),
  ('MOJ', 'Mojo',          'ሞጆ',        'town', 'Oromia',      ST_SetSRID(ST_MakePoint(39.1237,  8.5905), 4326)::geography),
  ('ADA', 'Adama',         'አዳማ',       'city', 'Oromia',      ST_SetSRID(ST_MakePoint(39.2700,  8.5400), 4326)::geography),
  ('MEK', 'Meki',          'መቂ',        'town', 'Oromia',      ST_SetSRID(ST_MakePoint(38.8240,  8.1510), 4326)::geography),
  ('BAT', 'Batu',          'ባቱ',        'town', 'Oromia',      ST_SetSRID(ST_MakePoint(38.7167,  7.9300), 4326)::geography),
  ('SHA', 'Shashemene',    'ሻሸመኔ',      'city', 'Oromia',      ST_SetSRID(ST_MakePoint(38.6000,  7.2000), 4326)::geography),
  ('HWS', 'Hawassa',       'ሐዋሳ',       'city', 'Sidama',      ST_SetSRID(ST_MakePoint(38.4767,  7.0500), 4326)::geography),
  ('AWA', 'Awash',         'አዋሽ',       'town', 'Afar',        ST_SetSRID(ST_MakePoint(40.1667,  8.9833), 4326)::geography),
  ('MIE', 'Mieso',         'ሚኤሶ',       'town', 'Oromia',      ST_SetSRID(ST_MakePoint(40.7500,  9.2400), 4326)::geography),
  ('DIR', 'Dire Dawa',     'ድሬዳዋ',      'city', 'Dire Dawa',   ST_SetSRID(ST_MakePoint(41.8661,  9.6009), 4326)::geography),
  ('DJI', 'Djibouti Port', 'ጅቡቲ',       'port', 'Djibouti',    ST_SetSRID(ST_MakePoint(43.1450, 11.5886), 4326)::geography),
  ('DEJ', 'Dejen',         'ደጀን',       'town', 'Amhara',      ST_SetSRID(ST_MakePoint(38.1333, 10.1667), 4326)::geography),
  ('DEM', 'Debre Markos',  'ደብረ ማርቆስ',  'city', 'Amhara',      ST_SetSRID(ST_MakePoint(37.7167, 10.3333), 4326)::geography),
  ('BDR', 'Bahir Dar',     'ባሕር ዳር',    'city', 'Amhara',      ST_SetSRID(ST_MakePoint(37.3908, 11.5936), 4326)::geography),
  ('WEL', 'Weliso',        'ወሊሶ',       'town', 'Oromia',      ST_SetSRID(ST_MakePoint(37.9833,  8.5333), 4326)::geography),
  ('JIM', 'Jimma',         'ጅማ',        'city', 'Oromia',      ST_SetSRID(ST_MakePoint(36.8333,  7.6667), 4326)::geography),
  ('DBE', 'Debre Berhan',  'ደብረ ብርሃን',  'city', 'Amhara',      ST_SetSRID(ST_MakePoint(39.5333,  9.6833), 4326)::geography),
  ('KOM', 'Kombolcha',     'ኮምቦልቻ',     'city', 'Amhara',      ST_SetSRID(ST_MakePoint(39.7333, 11.0833), 4326)::geography),
  ('WOL', 'Woldia',        'ወልዲያ',      'town', 'Amhara',      ST_SetSRID(ST_MakePoint(39.6000, 11.8333), 4326)::geography),
  ('MKL', 'Mekelle',       'መቀሌ',       'city', 'Tigray',      ST_SetSRID(ST_MakePoint(39.4753, 13.4967), 4326)::geography);

-- corridor definitions: code, name, via, road distance, origin, destination
WITH defs(code, name, via, dist, o, d) AS (VALUES
  ('ADD-HWS', 'Addis ⇄ Hawassa',     'via Mojo',                      275::numeric, 'ADD', 'HWS'),
  ('ADD-DJI', 'Addis ⇄ Djibouti',    'via Adama, Dire Dawa',          910::numeric, 'ADD', 'DJI'),
  ('ADD-DIR', 'Addis ⇄ Dire Dawa',   'via Awash',                     445::numeric, 'ADD', 'DIR'),
  ('ADD-BDR', 'Addis ⇄ Bahir Dar',   'via Debre Markos',              565::numeric, 'ADD', 'BDR'),
  ('ADD-ADA', 'Addis ⇄ Adama',       'expressway',                    100::numeric, 'ADD', 'ADA'),
  ('ADD-JIM', 'Addis ⇄ Jimma',       'via Weliso',                    350::numeric, 'ADD', 'JIM'),
  ('ADD-MKL', 'Addis ⇄ Mekelle',     'via Kombolcha',                 783::numeric, 'ADD', 'MKL')
)
INSERT INTO corridors (code, name, via, distance_km, origin_place_id, destination_place_id)
SELECT d.code, d.name, d.via, d.dist, po.id, pd.id
FROM defs d
JOIN places po ON po.code = d.o
JOIN places pd ON pd.code = d.d;

-- ordered stops with road-km marks measured from the corridor origin
WITH stops(corridor, place, seq, km) AS (VALUES
  ('ADD-HWS','ADD',1,0), ('ADD-HWS','MOJ',2,73), ('ADD-HWS','MEK',3,135), ('ADD-HWS','BAT',4,163), ('ADD-HWS','SHA',5,250), ('ADD-HWS','HWS',6,275),

  ('ADD-DJI','ADD',1,0), ('ADD-DJI','MOJ',2,73), ('ADD-DJI','ADA',3,100), ('ADD-DJI','AWA',4,215), ('ADD-DJI','MIE',5,345), ('ADD-DJI','DIR',6,445), ('ADD-DJI','DJI',7,910),

  ('ADD-DIR','ADD',1,0), ('ADD-DIR','MOJ',2,73), ('ADD-DIR','ADA',3,100), ('ADD-DIR','AWA',4,215), ('ADD-DIR','MIE',5,345), ('ADD-DIR','DIR',6,445),

  ('ADD-BDR','ADD',1,0), ('ADD-BDR','DEJ',2,207), ('ADD-BDR','DEM',3,300), ('ADD-BDR','BDR',4,565),

  ('ADD-ADA','ADD',1,0), ('ADD-ADA','MOJ',2,73), ('ADD-ADA','ADA',3,100),

  ('ADD-JIM','ADD',1,0), ('ADD-JIM','WEL',2,114), ('ADD-JIM','JIM',3,350),

  ('ADD-MKL','ADD',1,0), ('ADD-MKL','DBE',2,120), ('ADD-MKL','KOM',3,380), ('ADD-MKL','WOL',4,520), ('ADD-MKL','MKL',5,783)
)
INSERT INTO corridor_stops (corridor_id, place_id, seq, km_from_origin)
SELECT c.id, p.id, s.seq, s.km
FROM stops s
JOIN corridors c ON c.code = s.corridor
JOIN places p ON p.code = s.place;

-- route polyline through the stops, in order
UPDATE corridors c SET route = (
  SELECT ST_MakeLine(p.location::geometry ORDER BY cs.seq)::geography
  FROM corridor_stops cs JOIN places p ON p.id = cs.place_id
  WHERE cs.corridor_id = c.id
);
