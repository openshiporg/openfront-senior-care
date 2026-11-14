import { Lora, Source_Sans_3 } from 'next/font/google'

/** The storefront's two faces: a gentle serif for headings, navigation and labels; a humanist sans for times, fields and small print. */
export const storefrontSerif = Lora({ subsets: ['latin'], variable: '--sf-serif', display: 'swap' })
export const storefrontSans = Source_Sans_3({ subsets: ['latin'], variable: '--sf-sans', display: 'swap' })
