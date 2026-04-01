// IMPORTANT: This file is required for Genkit to work with Next.js.
// You can read more about this file here:
// https://firebase.google.com/docs/genkit/nextjs

import {nextHandler} from '@genkit-ai/next';
import '@/ai/dev';

export const POST = nextHandler();
