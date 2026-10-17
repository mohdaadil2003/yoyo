# NEXT STEP - Supabase setup

The canonical Supabase schema lives in `next-app/supabase/migrations/` and is
applied with the Supabase CLI. The old hand-run schema and seed files were
removed because they allowed unrestricted writes and session-id based access.

```sh
supabase link --project-ref <project-ref>
supabase db push
```

The migration contains no sample data. Create users through Supabase Auth and
approve employer listings through the application. Public job reads expose only
approved, published, non-expired listings. All user-owned rows require
`auth.uid()` ownership, and storage uploads are restricted to authenticated
users' own folders.

Set the variables documented in `next-app/.env.example`. The anon key is safe
for browser/server SSR clients; the service-role key is server-only and must
never be exposed to the client.
