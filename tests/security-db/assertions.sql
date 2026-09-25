-- TEST DATABASE ONLY. Synthetic fixtures. Never run against the live league.
DO $$ BEGIN IF current_database()<>'sohail_security_test' THEN RAISE EXCEPTION 'TEST DATABASE ONLY'; END IF; END $$;
BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE r jsonb; st jsonb; a jsonb;
 h text:='v3:scrypt:32768:8:3:'||repeat('1',32)||':'||repeat('2',64);
 h2 text:='v3:scrypt:32768:8:3:'||repeat('3',32)||':'||repeat('4',64);
 sid text:=repeat('a',64); psid text:=repeat('b',64); tsid text:=repeat('c',64);
 n integer; failed boolean; before_state jsonb; after_state jsonb;
BEGIN
 IF (SELECT principal_key FROM public.passkeys WHERE credential_id='existing-device-player') IS DISTINCT FROM 'g:p1' THEN RAISE EXCEPTION 'Unambiguous passkey binding failed'; END IF;
 SELECT data INTO before_state FROM public.liga_state WHERE id='liga-actual';
 r=public.sohail_p2_rehash('g:p1',0,'legacy-player',h,false,false);
 IF r->>'ok' IS DISTINCT FROM 'true' OR (r->'account'->>'epoch')::bigint<>0 THEN RAISE EXCEPTION 'Rehash failed'; END IF;
 SELECT data INTO after_state FROM public.liga_state WHERE id='liga-actual';
 IF after_state->'matches' IS DISTINCT FROM before_state->'matches' OR after_state->'_v' IS DISTINCT FROM before_state->'_v' THEN RAISE EXCEPTION 'Rehash altered sports/version'; END IF;
 IF (SELECT data->'users'->'Historical alias'->>'pass' FROM public.liga_state WHERE id='liga-anterior')<>h THEN RAISE EXCEPTION 'Historical shadow not updated'; END IF;
 IF (SELECT pass FROM public.jugadores WHERE id='p1')<>h THEN RAISE EXCEPTION 'Catalog shadow not updated'; END IF;
 r=public.sohail_p2_rehash('g:p1',0,'legacy-player',h2,false,false);
 IF r->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Stale rehash accepted'; END IF;
 r=public.sohail_p2_session('create',jsonb_build_object('id',sid,'public_id','00000000-0000-4000-8000-000000000001','principal','n:admin','epoch',0,'method','password','device','Test browser'));
 IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Create admin session failed'; END IF;
 r=public.sohail_p2_session('create',jsonb_build_object('id',psid,'public_id','00000000-0000-4000-8000-000000000002','principal','g:p1','epoch',0,'method','passkey','credential_id','existing-device-player'));
 IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Create bound passkey session failed'; END IF;
 IF (r->'session'->>'expires_at')::timestamptz-(r->'session'->>'created_at')::timestamptz<>interval '24 hours' THEN RAISE EXCEPTION 'Normal lifetime not 24h'; END IF;
 -- Two sessions cannot revoke somebody else's public identifier.
 r=public.sohail_p2_session('revoke-one',jsonb_build_object('id',psid,'principal','g:p1','epoch',0,'target','00000000-0000-4000-8000-000000000001'));
 IF (r->>'revoked')::int<>0 THEN RAISE EXCEPTION 'Foreign session revoked'; END IF;
 -- Chosen temporary password reset: epoch, shadows, sessions, audit in one txn.
 r=public.sohail_p2_change_password(jsonb_build_object('actor','admin','actor_key','n:admin','session_hash',sid,'target','Player','target_key','g:p1','target_epoch',0,'expected_hash',h,'hash',h2,'liga','liga-actual'));
 IF r->>'ok' IS DISTINCT FROM 'true' OR r->'account'->>'must_change' IS DISTINCT FROM 'true' OR (r->'account'->>'epoch')::int<>1 THEN RAISE EXCEPTION 'Temporary reset failed'; END IF;
 r=public.sohail_p2_session('read',jsonb_build_object('id',psid,'principal','g:p1','epoch',0));
 IF r->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Reset did not revoke old token'; END IF;
 r=public.sohail_p2_session('create',jsonb_build_object('id',tsid,'public_id','00000000-0000-4000-8000-000000000003','principal','g:p1','epoch',1,'method','password'));
 IF r->>'ok' IS DISTINCT FROM 'true' OR (r->'session'->>'expires_at')::timestamptz-(r->'session'->>'created_at')::timestamptz<>interval '15 minutes' THEN RAISE EXCEPTION 'Temporary session lifetime incorrect'; END IF;
 r=public.sohail_p2_passkey('register',jsonb_build_object('session_hash',tsid,'epoch',1,'liga','liga-actual','principal_key','g:p1','user_name','Player','credential_id','forbidden-temp','public_key','TEST','counter',0));
 IF r->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Temporary account registered a device'; END IF;
 r=public.sohail_p2_change_password(jsonb_build_object('actor','Player','actor_key','g:p1','session_hash',tsid,'target','Player','target_key','g:p1','target_epoch',1,'expected_hash',h2,'hash',h,'liga','liga-actual'));
 IF r->>'ok' IS DISTINCT FROM 'true' OR r->'account'->>'must_change' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Personal password change failed'; END IF;
 -- Guards are checked again in the database immediately before a mutation.
 UPDATE public.sohail_auth_sessions SET verified_at=clock_timestamp()-interval '11 minutes' WHERE id=sid;
 r=public.sohail_p2_change_password(jsonb_build_object('actor','admin','actor_key','n:admin','session_hash',sid,'target','Other','target_key','g:p2','target_epoch',0,'expected_hash','legacy-other','hash',h,'liga','liga-actual'));
 IF r->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Stale admin verification accepted'; END IF;
 UPDATE public.sohail_auth_sessions SET verified_at=clock_timestamp() WHERE id=sid;
 r=public.sohail_p2_passkey('register',jsonb_build_object('session_hash',sid,'epoch',0,'liga','liga-actual','principal_key','n:admin','user_name','admin','credential_id','new-admin-device','public_key','TEST','counter',0));
 IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Passkey registration failed'; END IF;
 r=public.sohail_p2_passkey('counter',jsonb_build_object('credential_id','new-admin-device','principal_key','n:admin','expected',0,'counter',3));
 IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Counter update failed'; END IF;
 r=public.sohail_p2_passkey('counter',jsonb_build_object('credential_id','new-admin-device','principal_key','n:admin','expected',0,'counter',1));
 IF r->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Stale counter accepted'; END IF;
 -- Single-use challenge is persistent, not a process-local cache.
 r=public.sohail_p2_challenge('issue',jsonb_build_object('id',repeat('d',64),'kind','auth'));
 r=public.sohail_p2_challenge('consume',jsonb_build_object('id',repeat('d',64),'kind','auth'));
 IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Challenge could not be consumed'; END IF;
 r=public.sohail_p2_challenge('consume',jsonb_build_object('id',repeat('d',64),'kind','auth'));
 IF r->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Challenge replay accepted'; END IF;
 -- Epoch and hash downgrade prohibited, including a still-running old server.
 failed=false;BEGIN UPDATE public.sohail_account_security SET pass_hash='v2:'||repeat('9',64) WHERE id='g:p1';EXCEPTION WHEN OTHERS THEN failed=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Hash downgrade accepted'; END IF;
 failed=false;BEGIN UPDATE public.sohail_account_security SET epoch=0 WHERE id='g:p1';EXCEPTION WHEN OTHERS THEN failed=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Epoch downgrade accepted'; END IF;
 -- Missing shadow row causes a complete rollback, not a half-changed account.
 INSERT INTO public.sohail_account_security(id,pass_hash) VALUES('g:missing','legacy');
 failed=false;BEGIN PERFORM public.sohail_p2_store_password('g:missing',0,h,false,false);EXCEPTION WHEN OTHERS THEN failed=true;END;
 IF NOT failed OR (SELECT pass_hash FROM public.sohail_account_security WHERE id='g:missing')<>'legacy' THEN RAISE EXCEPTION 'Atomic rollback failed'; END IF;
 -- Rotation preserves absolute expiry and revokes the original session.
 r=public.sohail_p2_session('create',jsonb_build_object('id',repeat('e',64),'public_id','00000000-0000-4000-8000-000000000004','principal','n:admin','epoch',0,'method','password','previous',sid));
 IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Rotation failed'; END IF;
 IF (SELECT expires_at FROM public.sohail_auth_sessions WHERE id=sid) IS DISTINCT FROM (SELECT expires_at FROM public.sohail_auth_sessions WHERE id=repeat('e',64)) THEN RAISE EXCEPTION 'Rotation extended expiry'; END IF;
 r=public.sohail_p2_session('read',jsonb_build_object('id',sid,'principal','n:admin','epoch',0));IF r->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Rotation kept old token'; END IF;
 r=public.sohail_p2_session('revoke',jsonb_build_object('id',repeat('e',64),'principal','n:admin','epoch',0));IF r->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Logout failed'; END IF;
 r=public.sohail_p2_session('read',jsonb_build_object('id',repeat('e',64),'principal','n:admin','epoch',0));IF r->>'ok' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Logout did not invalidate token'; END IF;
 IF (SELECT data->'matches' FROM public.liga_state WHERE id='liga-actual') IS DISTINCT FROM before_state->'matches' THEN RAISE EXCEPTION 'Sports data was modified'; END IF;
 RAISE NOTICE 'Part 2 native PostgreSQL assertions passed (synthetic data only).';
END $$;
ROLLBACK;
