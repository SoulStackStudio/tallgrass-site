// Public settings for the Tallgrass site. Nothing secret lives here: the publishable key is meant to be public, and the
// PIN check + download links stay in Supabase (supabase/site.sql).
window.TALLGRASS = {
  supabaseUrl: 'https://ichbrsusxpgfnegrqotu.supabase.co',
  supabaseKey: 'sb_publishable_0GSHXo0n3Me4nzhQSgZg7w_6kQ3hYeo',
  discord: 'https://discord.gg/Bg253nrRps',
  // ?mock=open|pin|closed (mock PIN 123456) only works on localhost previews, never on the live site
  mockHosts: ['localhost', '127.0.0.1', '[::1]'],
}
