# Explore location and activity provenance

Explore may display an experience-level map pin only when its location evidence
record is marked `verified`, an organisation contact has explicitly consented
to public disclosure, and a reviewer has recorded a public source URL.

Accepted source types are:

- `organisation_site`: a public experience or venue listing on the organisation's own site.
- `venue_site`: a public listing controlled by the named venue.
- `public_partner_event`: a public event listing controlled by an official partner.

User device coordinates, profile-city coordinates, guessed geocodes, and
unreviewed host-entered coordinates are not acceptable evidence. Do not add a
Google Maps runtime key, geocoding service, or billing dependency for this flow.
Do not publish home addresses or locations whose host has not consented.

The API returns only reviewed and consented coordinates, rounded by the stored
precision: `city` to 1 decimal place, `neighborhood` to 2, and `venue_area` to
3. The source coordinates and consent/reviewer identities remain server-side.
Missing, pending, rejected, malformed, or incomplete evidence yields no public
coordinates. City-level aggregates and the experience list remain the fallback.

Explore's recent activity is a city-only count of participation records whose
status is `verified` and whose `verifiedAt` falls within the rolling 30-day
window. The host has verified completion; this is not a live check-in, a list
of participants, or an impact measurement. XP shown in the existing Impact
layer remains XP offered, not XP earned or verified impact.

There is no public or host API for promoting a location record to verified.
Until an authorised review workflow exists, records must remain pending unless
they have been reviewed through a trusted internal process. Never mark a
record verified just to make a map pin appear.