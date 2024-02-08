import { Archivo, Instrument_Sans, JetBrains_Mono, Noto_Sans_Ethiopic } from 'next/font/google';

// Archivo Expanded for headlines and route names, Instrument Sans for the interface,
// JetBrains Mono for anything read back over the phone (plates, shipment ids, PINs, weights).
export const archivo = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-archivo', display: 'swap' });
export const instrument = Instrument_Sans({ subsets: ['latin'], variable: '--font-instrument', display: 'swap' });
export const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });
export const ethiopic = Noto_Sans_Ethiopic({ subsets: ['ethiopic'], weight: ['400', '600', '700'], variable: '--font-ethiopic', display: 'swap' });

export const fontVariables = [archivo.variable, instrument.variable, jetbrains.variable, ethiopic.variable].join(' ');
