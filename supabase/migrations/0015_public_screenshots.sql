-- Make the screenshots bucket public so report/proof images render via a plain
-- public URL — no service-role key needed at display time. The objects are
-- PageSpeed/SEO/health report screenshots of a public site (not sensitive), and
-- anon read was already granted in 0010. Writes still require the service role.
update storage.buckets set public = true where id = 'screenshots';
