---
name: Friend schedule privacy
description: Product rules for username discovery and friend timetable sharing.
---

Find accounts through an exact unique username. Discovery must not expose email addresses. A timetable may be read only after a friendship is accepted; friend views remain read-only and Supabase RLS is the final access-control authority.

**Why:** These are explicit product requirements, and UI restrictions alone are not sufficient to protect private schedules.

**How to apply:** Preserve exact-handle lookup and accepted-only schedule access in any changes to account discovery, friendship requests, or timetable sharing.