# Analytics Taxonomy (Week 1 v1)

This project uses Vercel Analytics custom events for core funnel tracking.

## Funnel events

- `session_started`
  - Fires once per app start.
- `content_loaded`
  - Fires when `poems.json` and `poets.json` are loaded.
  - Props: `poems_count`, `poets_count`.
- `screen_viewed`
  - Fires when app screen changes.
  - Props: `screen`, `is_desktop`.
- `feeling_selected`
  - Fires when a mood is tapped from home.
  - Props: `feeling`, `source_screen`.
- `discovery_opened`
  - Fires when discovery results are opened.
  - Props: `discovery_key`, `source_screen`, `source_type`.
- `poem_opened`
  - Fires whenever a poem detail page is opened.
  - Props: `poem_id`, `source_origin`, `source_screen`, `source_voice_id`, `source_collection_id`, `feeling`.
- `next_poem_clicked`
  - Fires when "Continue Reading" opens the next poem.
  - Props: `current_poem_id`, `next_poem_id`, `source_origin`.
- `voice_opened`
  - Fires when a voice profile is opened.
  - Props: `voice_id`, `source_screen`.
- `voice_works_opened`
  - Fires when a voice's works list is opened.
  - Props: `voice_id`, `source_screen`.
- `collection_opened`
  - Fires when a collection detail page is opened.
  - Props: `collection_id`, `source_screen`.
- `collections_view_all_clicked`
  - Fires when home "View All" for collections is clicked.
  - Props: `source_screen`.
- `bottom_nav_clicked`
  - Fires on primary dock navigation.
  - Props: `target_screen`.

## Attribution fields added to every event

The analytics helper automatically appends:

- Current UTM values: `current_utm_source`, `current_utm_medium`, `current_utm_campaign`, `current_utm_content`, `current_utm_term`.
- First-touch values (persisted in localStorage): `first_utm_source`, `first_utm_medium`, `first_utm_campaign`, `first_utm_content`, `first_utm_term`.
- First-touch context: `first_referrer`, `first_landing_path`.
- Request context: `path`.

## Notes

- First-touch attribution is captured once per browser profile.
- Event names intentionally use snake_case for consistency in dashboard filtering.
