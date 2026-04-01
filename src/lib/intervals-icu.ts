export function buildIntervalsAuthHeader(apiKey: string): string {
  const cleanKey = apiKey.trim();
  // Intervals.icu API: username="API_KEY", password=your API key (per forum/docs)
  return `Basic ${Buffer.from(`API_KEY:${cleanKey}`).toString('base64')}`;
}
