--
-- PostgreSQL database dump
--

\restrict N7EuCRdDwC6ZPc7AGbQYToc1MtQ3vKvrYBv3N6HFkp0pCap8VsQKDRe7rIl4euT

-- Dumped from database version 16.11
-- Dumped by pg_dump version 16.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: todo
--

CREATE SCHEMA drizzle;


ALTER SCHEMA drizzle OWNER TO todo;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: todo
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);


ALTER TABLE drizzle.__drizzle_migrations OWNER TO todo;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: todo
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNER TO todo;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: todo
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- Name: attachments; Type: TABLE; Schema: public; Owner: todo
--

CREATE TABLE public.attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    todo_id uuid NOT NULL,
    user_id uuid NOT NULL,
    filename text NOT NULL,
    stored_filename text NOT NULL,
    mime_type text NOT NULL,
    size integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.attachments OWNER TO todo;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: todo
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action text NOT NULL,
    resource_type text,
    resource_id text,
    details text,
    ip_address text,
    user_agent text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    module text
);


ALTER TABLE public.audit_logs OWNER TO todo;

--
-- Name: categories; Type: TABLE; Schema: public; Owner: todo
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    color text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.categories OWNER TO todo;

--
-- Name: remarks; Type: TABLE; Schema: public; Owner: todo
--

CREATE TABLE public.remarks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    todo_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.remarks OWNER TO todo;

--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: todo
--

CREATE TABLE public.system_settings (
    id integer DEFAULT 1 NOT NULL,
    min_duration_min integer DEFAULT 5 NOT NULL,
    max_duration_min integer DEFAULT 1440 NOT NULL,
    default_duration_min integer DEFAULT 30 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.system_settings OWNER TO todo;

--
-- Name: todos; Type: TABLE; Schema: public; Owner: todo
--

CREATE TABLE public.todos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    done boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    start_at timestamp without time zone,
    duration_min integer,
    category text,
    unscheduled_at timestamp without time zone,
    description text,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    is_pinned boolean DEFAULT false NOT NULL
);


ALTER TABLE public.todos OWNER TO todo;

--
-- Name: user_settings; Type: TABLE; Schema: public; Owner: todo
--

CREATE TABLE public.user_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    working_hours text DEFAULT '{"start":"09:00","end":"17:00"}'::text NOT NULL,
    working_days text DEFAULT '[1,2,3,4,5]'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_settings OWNER TO todo;

--
-- Name: users; Type: TABLE; Schema: public; Owner: todo
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    must_change_password boolean DEFAULT false NOT NULL,
    role text DEFAULT 'user'::text NOT NULL,
    is_admin boolean DEFAULT false NOT NULL,
    failed_login_attempts integer DEFAULT 0 NOT NULL,
    lock_until timestamp without time zone
);


ALTER TABLE public.users OWNER TO todo;

--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: todo
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Data for Name: __drizzle_migrations; Type: TABLE DATA; Schema: drizzle; Owner: todo
--

COPY drizzle.__drizzle_migrations (id, hash, created_at) FROM stdin;
1	31b4edceb7b2d5866ce11d085782a68f3abb13df55d6a44e59c6561bbc0c449f	1768459753426
2	d270f7cdd7ab74b7f23cbe607a1b2197832ff9a0a6c3ecea48866a2c1613388d	1768462288715
3	afbf8839197376e804cd0dbbcaf36bbb6baf6f93d4bfdea722f59a06bfe98dbd	1768804673140
4	0ec90538b64a10fd5d93d53d0ec3de1cca12c460cb8bff4dc0366d7bdd6d9e0d	1768830930621
5	b6e1d23511e88294a79bf8c2b42e908224b915a336dc39db52806de95cd48a3b	1768905011425
6	bdacda7cec560044f5ca68af15360c0ac3ef568254673316e1477a7d64234eba	1768918152166
7	dceb147fe8d7f698ecc2d0ab0ad4d441ff5fa978a449daed3d34d5beb5b84491	1769100000000
8	9ba6e700ea489b9c86dfecf8a61862dffc25a26627fc1729ca5c6f4d244e2ec4	1769193889431
9	e23aaee8c218b7ec02e47e69862939b1f7c048bed38adc59ab766788f5c3108a	1769193889432
10	90a31240c75d93ff55b858f7f094d70d58ed9ceef1d0b2cb0f8063505a4347a4	1769316939187
11	eefde4a877a2493a3d81849caa4369c34f247e798ba2c374a6cc56a1933614e5	1769326431546
12	8e4a5379d1bc6c346b1d1727e96d7956910ddfef6bd7faa59d004aa3cb7c22e9	1769341714792
13	0e11e0d692a173c13cd85deddbc8803ca69b8434c4b527218478c5274986286c	1769359958079
14	d1b910f0dd795cd669a00aa4e52a942a9dbe7c42759fdc716d252c8c5e582f47	1769417251549
\.


--
-- Data for Name: attachments; Type: TABLE DATA; Schema: public; Owner: todo
--

COPY public.attachments (id, todo_id, user_id, filename, stored_filename, mime_type, size, created_at) FROM stdin;
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: todo
--

COPY public.audit_logs (id, user_id, action, resource_type, resource_id, details, ip_address, user_agent, created_at, module) FROM stdin;
dc12521d-a4df-4f9c-85f7-cc5c61d91490	24a13ce5-18b1-4755-858c-f394d7c152e6	auth.register	user	24a13ce5-18b1-4755-858c-f394d7c152e6	{"email":"a@a.com"}	::ffff:172.18.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	2026-01-26 10:19:38.982272	auth
b76d34af-4910-42a8-a993-fbb588b0c50e	24a13ce5-18b1-4755-858c-f394d7c152e6	auth.login	user	24a13ce5-18b1-4755-858c-f394d7c152e6	{"email":"a@a.com"}	::ffff:172.18.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	2026-01-26 10:19:39.124278	auth
af547e62-94c9-4c3a-9aae-b414fe7b48ca	24a13ce5-18b1-4755-858c-f394d7c152e6	auth.logout	user	24a13ce5-18b1-4755-858c-f394d7c152e6	\N	::ffff:172.18.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	2026-01-26 10:19:42.560049	auth
b2dd30c0-d656-45f9-8bf6-7a817802eed0	b78d3f00-9065-4a5f-a9e4-96815d01551d	auth.login	user	b78d3f00-9065-4a5f-a9e4-96815d01551d	{"email":"admin@example.com"}	::ffff:172.18.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	2026-01-26 10:22:39.401277	auth
46c09bc0-6de2-4787-912b-d3f49a536ff0	b78d3f00-9065-4a5f-a9e4-96815d01551d	auth.password_change	user	b78d3f00-9065-4a5f-a9e4-96815d01551d	\N	::ffff:172.18.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	2026-01-26 10:22:46.762809	auth
a6136bf1-a2b1-402f-875a-a7916b1f8464	b78d3f00-9065-4a5f-a9e4-96815d01551d	auth.login	user	b78d3f00-9065-4a5f-a9e4-96815d01551d	{"email":"admin@example.com"}	::ffff:172.18.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	2026-01-26 10:22:55.061625	auth
c21d8572-745a-4422-a5a4-035e5b1a63e2	b78d3f00-9065-4a5f-a9e4-96815d01551d	auth.logout	user	b78d3f00-9065-4a5f-a9e4-96815d01551d	\N	::ffff:172.18.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	2026-01-26 10:28:25.630644	auth
e21d1096-30d7-4e40-bd6c-39c2f99d1b98	24a13ce5-18b1-4755-858c-f394d7c152e6	auth.login	user	24a13ce5-18b1-4755-858c-f394d7c152e6	{"email":"a@a.com"}	::ffff:172.18.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	2026-01-26 10:28:36.611151	auth
54222f02-ec8b-4aa0-990c-4f0cd5be2bde	24a13ce5-18b1-4755-858c-f394d7c152e6	todo.create	todo	eba3f601-9a1d-41f9-9292-05caf8067d6e	{"title":"Test","category":"Work"}	::ffff:172.18.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	2026-01-26 10:28:56.545215	task
34db5c51-eff8-47a0-af6d-3b476b06e482	24a13ce5-18b1-4755-858c-f394d7c152e6	todo.schedule	todo	eba3f601-9a1d-41f9-9292-05caf8067d6e	{"startAt":"2026-01-27T18:00:00.000Z","durationMin":30,"changes":{"startAt":{"from":null,"to":"2026-01-27T18:00:00.000Z"}}}	::ffff:172.18.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	2026-01-26 10:28:56.594429	task
b9b58fcf-99ce-4381-b7c5-acf353309f96	24a13ce5-18b1-4755-858c-f394d7c152e6	todo.unschedule	todo	eba3f601-9a1d-41f9-9292-05caf8067d6e	{"startAt":null,"changes":{"startAt":{"from":"2026-01-27T18:00:00.000Z","to":null}}}	::ffff:172.18.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	2026-01-26 10:28:59.930787	task
33b69e84-93b3-42d1-8a6b-94113c678bb2	b78d3f00-9065-4a5f-a9e4-96815d01551d	auth.login	user	b78d3f00-9065-4a5f-a9e4-96815d01551d	{"email":"admin@example.com"}	::ffff:172.18.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	2026-01-26 10:29:10.928617	auth
3525dc94-d4f7-48ec-9c4b-bedda232fdd0	b78d3f00-9065-4a5f-a9e4-96815d01551d	category.create	category	62a2beee-5a7f-4917-9de5-833dda13b877	{"name":"Test Category 1","color":"#06b6d4"}	::ffff:172.18.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	2026-01-26 10:29:27.096567	category
4993bd61-6207-48e1-9e37-5a20b915cc26	24a13ce5-18b1-4755-858c-f394d7c152e6	todo.update	todo	eba3f601-9a1d-41f9-9292-05caf8067d6e	{"title":"Test","description":"Test description","category":"Other","durationMin":30}	::ffff:172.18.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	2026-01-26 10:29:41.53442	task
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: todo
--

COPY public.categories (id, user_id, name, color, sort_order, created_at) FROM stdin;
62a2beee-5a7f-4917-9de5-833dda13b877	b78d3f00-9065-4a5f-a9e4-96815d01551d	Test Category 1	#06b6d4	0	2026-01-26 10:29:27.087553
\.


--
-- Data for Name: remarks; Type: TABLE DATA; Schema: public; Owner: todo
--

COPY public.remarks (id, todo_id, user_id, content, created_at) FROM stdin;
\.


--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: todo
--

COPY public.system_settings (id, min_duration_min, max_duration_min, default_duration_min, created_at, updated_at) FROM stdin;
1	5	1440	30	2026-01-26 10:17:21.71305	2026-01-26 10:17:21.71305
\.


--
-- Data for Name: todos; Type: TABLE DATA; Schema: public; Owner: todo
--

COPY public.todos (id, user_id, title, done, created_at, start_at, duration_min, category, unscheduled_at, description, updated_at, is_pinned) FROM stdin;
eba3f601-9a1d-41f9-9292-05caf8067d6e	24a13ce5-18b1-4755-858c-f394d7c152e6	Test	f	2026-01-26 10:28:56.535499	\N	30	Other	2026-01-26 10:28:59.914	Test description	2026-01-26 10:29:41.527	f
\.


--
-- Data for Name: user_settings; Type: TABLE DATA; Schema: public; Owner: todo
--

COPY public.user_settings (id, user_id, working_hours, working_days, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: todo
--

COPY public.users (id, email, password_hash, created_at, must_change_password, role, is_admin, failed_login_attempts, lock_until) FROM stdin;
24a13ce5-18b1-4755-858c-f394d7c152e6	a@a.com	$argon2id$v=19$m=65536,t=3,p=4$OL9cr5yUOEh8Aqzk6R1C6g$P1W1MoItZc4XrJ6kQySc+WDVNnd1G4yc27qdgW6x4dk	2026-01-26 10:19:38.96904	f	user	f	0	\N
b78d3f00-9065-4a5f-a9e4-96815d01551d	admin@example.com	$argon2id$v=19$m=65536,t=3,p=4$2KhihSibfNELp+eJu2E7zQ$N7Kfv5rB+xjQRtfgN45YxQP7KFUlqfp9qbFwF9BJC8o	2026-01-26 10:18:34.108339	f	admin	t	0	\N
\.


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE SET; Schema: drizzle; Owner: todo
--

SELECT pg_catalog.setval('drizzle.__drizzle_migrations_id_seq', 14, true);


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: todo
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: attachments attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: todo
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: todo
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: todo
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: remarks remarks_pkey; Type: CONSTRAINT; Schema: public; Owner: todo
--

ALTER TABLE ONLY public.remarks
    ADD CONSTRAINT remarks_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: todo
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: todos todos_pkey; Type: CONSTRAINT; Schema: public; Owner: todo
--

ALTER TABLE ONLY public.todos
    ADD CONSTRAINT todos_pkey PRIMARY KEY (id);


--
-- Name: user_settings user_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: todo
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_pkey PRIMARY KEY (id);


--
-- Name: user_settings user_settings_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: todo
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_user_id_unique UNIQUE (user_id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: todo
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: todo
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: attachments_todo_id_idx; Type: INDEX; Schema: public; Owner: todo
--

CREATE INDEX attachments_todo_id_idx ON public.attachments USING btree (todo_id);


--
-- Name: attachments_user_id_idx; Type: INDEX; Schema: public; Owner: todo
--

CREATE INDEX attachments_user_id_idx ON public.attachments USING btree (user_id);


--
-- Name: audit_logs_action_idx; Type: INDEX; Schema: public; Owner: todo
--

CREATE INDEX audit_logs_action_idx ON public.audit_logs USING btree (action);


--
-- Name: audit_logs_created_at_idx; Type: INDEX; Schema: public; Owner: todo
--

CREATE INDEX audit_logs_created_at_idx ON public.audit_logs USING btree (created_at);


--
-- Name: audit_logs_user_created_idx; Type: INDEX; Schema: public; Owner: todo
--

CREATE INDEX audit_logs_user_created_idx ON public.audit_logs USING btree (user_id, created_at);


--
-- Name: audit_logs_user_id_idx; Type: INDEX; Schema: public; Owner: todo
--

CREATE INDEX audit_logs_user_id_idx ON public.audit_logs USING btree (user_id);


--
-- Name: categories_user_id_idx; Type: INDEX; Schema: public; Owner: todo
--

CREATE INDEX categories_user_id_idx ON public.categories USING btree (user_id);


--
-- Name: categories_user_name_idx; Type: INDEX; Schema: public; Owner: todo
--

CREATE INDEX categories_user_name_idx ON public.categories USING btree (user_id, name);


--
-- Name: remarks_todo_created_idx; Type: INDEX; Schema: public; Owner: todo
--

CREATE INDEX remarks_todo_created_idx ON public.remarks USING btree (todo_id, created_at);


--
-- Name: remarks_todo_id_idx; Type: INDEX; Schema: public; Owner: todo
--

CREATE INDEX remarks_todo_id_idx ON public.remarks USING btree (todo_id);


--
-- Name: todos_user_created_at_idx; Type: INDEX; Schema: public; Owner: todo
--

CREATE INDEX todos_user_created_at_idx ON public.todos USING btree (user_id, created_at);


--
-- Name: todos_user_done_idx; Type: INDEX; Schema: public; Owner: todo
--

CREATE INDEX todos_user_done_idx ON public.todos USING btree (user_id, done);


--
-- Name: todos_user_id_idx; Type: INDEX; Schema: public; Owner: todo
--

CREATE INDEX todos_user_id_idx ON public.todos USING btree (user_id);


--
-- Name: todos_user_start_at_idx; Type: INDEX; Schema: public; Owner: todo
--

CREATE INDEX todos_user_start_at_idx ON public.todos USING btree (user_id, start_at);


--
-- Name: attachments attachments_todo_id_todos_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: todo
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_todo_id_todos_id_fk FOREIGN KEY (todo_id) REFERENCES public.todos(id) ON DELETE CASCADE;


--
-- Name: attachments attachments_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: todo
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: todo
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: categories categories_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: todo
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: remarks remarks_todo_id_todos_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: todo
--

ALTER TABLE ONLY public.remarks
    ADD CONSTRAINT remarks_todo_id_todos_id_fk FOREIGN KEY (todo_id) REFERENCES public.todos(id) ON DELETE CASCADE;


--
-- Name: remarks remarks_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: todo
--

ALTER TABLE ONLY public.remarks
    ADD CONSTRAINT remarks_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: todos todos_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: todo
--

ALTER TABLE ONLY public.todos
    ADD CONSTRAINT todos_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_settings user_settings_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: todo
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict N7EuCRdDwC6ZPc7AGbQYToc1MtQ3vKvrYBv3N6HFkp0pCap8VsQKDRe7rIl4euT

