---
name: Friend schedule privacy
description: Product rules for username discovery and friend timetable sharing.
---

Find accounts through an exact unique username. Discovery must not expose email addresses. Timetables, friend-event details, and profile photos are shared only with accepted friends (and remain private to the owner otherwise); Supabase RLS and storage policies are the final access-control authority.

**Why:** These are explicit product requirements, and UI restrictions alone are not sufficient to protect personal data.

**How to apply:** Preserve exact-handle lookup and accepted-only access for timetables, social event proposals, and private profile photos in any changes to account discovery, friendship requests, or sharing.