begin;

select plan(5);

select tests.rls_enabled('public', 'direct_tenants');
select tests.rls_enabled('public', 'direct_profiles');
select tests.rls_enabled('public', 'direct_credentials');
select tests.rls_enabled('public', 'direct_clients');
select tests.rls_enabled('public', 'direct_client_imports');

select * from finish();
rollback;
