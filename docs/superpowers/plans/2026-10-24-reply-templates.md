# Reply Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Chatwoot's canned responses into a reply-template library: a company library plus a personal library per agent, categories, favorites (pinned, reorderable) and recents per agent, and rich variables (system variables, fallbacks, and fields the agent fills in when picking a template).

**Architecture:** Extend the existing `canned_responses` table (company = `user_id IS NULL`, personal = owner's `user_id`) and add `canned_response_categories` and per-user `canned_response_preferences`. The existing `/canned_responses` API keeps its shape (bare array, `short_code`/`content` still accepted) and gains fields and member routes. On the dashboard, the `/` picker is rebuilt on the existing `CaretAnchoredPicker` (tabs, category chips, stars), a fill dialog asks for the template's own fields, a full library dialog opens with `Alt+T` or a toolbar button, and the settings page becomes a two-library manager with a template editor.

**Tech Stack:** Rails 7 / PostgreSQL / Pundit / RSpec; Vue 3 (`<script setup>`), Vuex, Tailwind (`n-*` tokens), Vitest; Liquid on send (backend already renders `{{ }}` left in messages).

**Spec:** `docs/superpowers/specs/2026-10-24-reply-templates-prototype.html` (the clickable prototype the owner approved; English UI). Where the prototype and this plan differ, this plan wins and says why.

## Global Constraints

- Base: Chatwoot CE **v4.19.0**, branch `feature/reply-templates` on `JohnnyZ8238/chatwoot`.
- All new UI copy is English, added to `app/javascript/dashboard/i18n/locale/en/cannedMgmt.json` only (other locales fall back).
- Existing integrations keep working: `GET /canned_responses` still returns a bare JSON array; `POST`/`PATCH` still accept `{ short_code, content }`; `?search=` still works and keeps its ordering.
- Company templates: only administrators create/update/delete. Personal templates: only their owner. Everyone in the account reads company templates; nobody reads someone else's personal ones.
- When `scope` is not given on create: administrators create company templates, everyone else personal (same rule as `Macro#set_visibility`), so "Add to canned responses" from the message menu keeps working for agents.
- Variable syntax stays Chatwoot/Liquid: `{{contact.first_name}}`, `{{contact.first_name | default: "there"}}`. Any `{{name}}` whose key has no dot and is not a known system variable is an **agent field**.
- Field types (exact): `text`, `long`, `number`, `money`, `date`, `select`, `yesno`. Field keys match `/\A[a-z][a-z0-9_]*\z/`.
- Library shortcut is `Alt+T` (`$mod+K` is Chatwoot's command bar; `Alt+T` is unused).
- Migrations are timestamped after `20261019143116`.

## Review Focus

1. **Personal template leakage** — a template with `user_id = A` must never appear in B's index, and B cannot update/delete/favorite it (404, not 403, so ids don't leak). Tests in Task 2.
2. **Old clients / message-menu "Add to canned responses"** posting only `{short_code, content}` as an agent must still succeed (as personal). Test in Task 2.
3. **Unresolved variables** — a system variable with no value and no fallback must stay `{{key}}` (backend Liquid fills it or blanks it); an agent field left empty and not required inserts as empty text, never as `{{field}}`. Tests in Task 4.
4. **Short code clashes** — personal `/ship` when company `/ship` exists is rejected; two agents may both own personal `/vip`. Tests in Task 1.
5. **Deleting a category** moves its templates to "no category" instead of deleting them. Test in Task 3.

---

## File Structure

Backend
- `db/migrate/20261024000001_create_canned_response_categories.rb`
- `db/migrate/20261024000002_add_template_fields_to_canned_responses.rb`
- `db/migrate/20261024000003_create_canned_response_preferences.rb`
- `app/models/canned_response.rb` (modify) · `app/models/canned_response_category.rb` · `app/models/canned_response_preference.rb`
- `app/models/account.rb`, `app/models/user.rb` (associations)
- `app/policies/canned_response_policy.rb` · `app/policies/canned_response_category_policy.rb`
- `app/controllers/api/v1/accounts/canned_responses_controller.rb` (modify) · `app/controllers/api/v1/accounts/canned_response_categories_controller.rb`
- `config/routes.rb`
- Specs: `spec/models/canned_response_spec.rb`, `spec/models/canned_response_category_spec.rb`, `spec/controllers/api/v1/accounts/canned_responses_controller_spec.rb` (modify), `spec/controllers/api/v1/accounts/canned_response_categories_controller_spec.rb`, factories.

Frontend
- `app/javascript/dashboard/helper/replyTemplates.js` — pure variable engine (parse fields, resolve, extra system variables, type guessing).
- `app/javascript/dashboard/api/cannedResponse.js` (modify: plain `ApiClient` + member calls) · `app/javascript/dashboard/api/cannedResponseCategories.js`
- `app/javascript/dashboard/store/modules/cannedResponse.js` (modify) · `app/javascript/dashboard/store/modules/cannedResponseCategories.js`
- `app/javascript/dashboard/components/widgets/conversation/CannedResponse.vue` (rewrite: `/` picker)
- `app/javascript/dashboard/components/widgets/conversation/replyTemplates/TemplateFillDialog.vue`
- `app/javascript/dashboard/components/widgets/conversation/replyTemplates/TemplateFieldInput.vue`
- `app/javascript/dashboard/components/widgets/conversation/replyTemplates/TemplateLibraryDialog.vue`
- `app/javascript/dashboard/components/widgets/WootWriter/Editor.vue` (wire fill dialog + library)
- `app/javascript/dashboard/routes/dashboard/settings/canned/Index.vue` (rewrite) · `TemplateEditorDialog.vue` (replaces `AddCanned.vue`/`EditCanned.vue`)
- `app/javascript/dashboard/i18n/locale/en/cannedMgmt.json`

---

### Task 1: Data model

**Files:** the three migrations, the three models, `account.rb`, `user.rb`, `spec/factories/canned_responses.rb`, `spec/factories/canned_response_categories.rb`, `spec/models/canned_response_spec.rb`, `spec/models/canned_response_category_spec.rb`; regenerate `db/schema.rb` by hand (no local Postgres — edit schema.rb to match migrations exactly and bump its version to `2026_10_24_000003`).

**Interfaces — Produces:**
- `canned_response_categories`: `account_id bigint not null`, `user_id bigint null` (null = company), `name string not null`, `position integer not null default 0`, timestamps; unique index `[account_id, user_id, name]`.
- `canned_responses` adds: `title string`, `user_id bigint null` (index), `canned_response_category_id bigint null` (index), `variables jsonb not null default []`, `usage_count integer not null default 0`; index `[account_id, user_id]`.
- `canned_response_preferences`: `account_id`, `user_id`, `canned_response_id` (bigint not null), `favorite boolean not null default false`, `favorite_position integer`, `use_count integer not null default 0`, `last_used_at datetime`; unique index `[user_id, canned_response_id]`.
- `CannedResponse`: `belongs_to :user, optional`, `belongs_to :category, class_name: 'CannedResponseCategory', foreign_key: :canned_response_category_id, optional`, `has_many :preferences, class_name: 'CannedResponsePreference', dependent: :delete_all`; `scope :company`, `scope :visible_to(user)`; `#company?`; `VARIABLE_TYPES = %w[text long number money date select yesno]`; `#as_template_json(preference = nil)` → `as_json` plus `'scope' => 'company'|'personal'`, `'title' => title.presence || short_code`, `'favorite'`, `'favorite_position'`, `'last_used_at'`, `'user_use_count'`.
- `CannedResponseCategory`: `belongs_to :account`, `belongs_to :user, optional`, `has_many :canned_responses, foreign_key: :canned_response_category_id, dependent: :nullify`; `scope :visible_to(user)`; `default_scope`-free, `scope :ordered → order(:position, :id)`; includes `AccountCacheRevalidator` is **not** used (categories are fetched fresh).
- `CannedResponsePreference`: `belongs_to :account, :user, :canned_response`.

- [ ] **Step 1: Write model specs** — `spec/models/canned_response_spec.rb`:
  - `rejects a personal short code that a company template uses` (company `ship`, personal `ship` for agent → invalid, error on `short_code`).
  - `allows two agents to own the same personal short code`.
  - `rejects a company short code already used by another company template`.
  - `rejects variables with an unknown type` (`[{ key: 'a', type: 'colour' }]` → invalid) and `with a bad key` (`'Order No'`).
  - `rejects a category from another owner` (company template with agent's personal category → invalid).
  - `#as_template_json` returns `scope: 'personal'`, `favorite: true`, `favorite_position: 2` for a preference with those values, and `title` falls back to `short_code`.
  - `visible_to(agent)` returns company + agent's own, not another agent's.
  - `spec/models/canned_response_category_spec.rb`: `destroying a category nullifies its templates`.
- [ ] **Step 2: Implement** migrations, models (replace `validates :short_code, uniqueness: { scope: :account_id }` with `validate :short_code_available`), associations (`Account has_many :canned_response_categories, dependent: :destroy_async`; `User has_many :canned_responses, dependent: :destroy` and `has_many :canned_response_preferences, dependent: :delete_all`), factories (`canned_response` gets `trait :personal { user }`), schema.rb.
- [ ] **Step 3: Commit** `feat(canned): add template categories, personal scope and preferences`.

### Task 2: Canned responses API

**Files:** `app/policies/canned_response_policy.rb`, `app/controllers/api/v1/accounts/canned_responses_controller.rb`, `config/routes.rb`, `spec/controllers/api/v1/accounts/canned_responses_controller_spec.rb`.

**Interfaces — Produces (routes under `/api/v1/accounts/:account_id/canned_responses`):**
- `GET /` → `[as_template_json]` for `visible_to(current_user)`, ordered favorites first by `favorite_position`, then `usage_count desc`, `id`; with `search` keeps `order_by_search`.
- `POST /` params `canned_response: { short_code, content, title, scope, canned_response_category_id, variables: [{ key, label, type, required, default, options: [] }] }` (top-level params still accepted — `params.require(:canned_response)` works today because of `wrap_parameters`).
- `PATCH /:id`, `DELETE /:id`.
- `POST /:id/use` → increments `usage_count` and the caller's preference `use_count`, sets `last_used_at`; returns `as_template_json`. Does **not** bump the account cache key (use `update_columns`).
- `POST /:id/favorite`, `DELETE /:id/favorite` → returns `as_template_json`; new favorites get `favorite_position = max + 1`.
- `PATCH /favorites` (collection) body `{ ids: [..] }` → rewrites `favorite_position` 0..n for the caller; returns `head :ok`.
- Policy: `index?/create?/use?/favorite?` true; `update?/destroy?` → `record.company? ? administrator? : record.user_id == user.id`. Records are fetched with `visible_to(current_user)` so foreign personal ids 404.

- [ ] **Step 1: Write request specs** (keep the existing ones passing, adjust the index expectation to `as_template_json`):
  - `agent creating with only short_code/content gets a personal template` (scope `personal`, `user_id` = agent).
  - `administrator creating without scope gets a company template`.
  - `agent asking for scope company still gets a personal template` (forced, like macros → asserts `user_id` = agent).
  - `agent cannot update or delete a company template` → 401 (Pundit's `NotAuthorizedError` maps to 401 in Chatwoot).
  - `agent gets 404 for another agent's personal template` on update, destroy, use, favorite.
  - `index never returns another agent's personal template`.
  - `use increments usage_count and sets last_used_at for the caller`.
  - `favorite / unfavorite / reorder` round trip: favorite A, B; `PATCH favorites ids: [B, A]`; index returns B then A first with positions 0, 1.
  - `rejects variables with an unknown type` → 422.
- [ ] **Step 2: Implement** controller + policy + routes (`resources :canned_responses do; member { post :use; post :favorite; delete :favorite, action: :unfavorite }; collection { patch :favorites, action: :reorder_favorites }; end`).
- [ ] **Step 3: Commit** `feat(canned): personal/company scopes, usage and favorites API`.

### Task 3: Categories API

**Files:** `app/policies/canned_response_category_policy.rb`, `app/controllers/api/v1/accounts/canned_response_categories_controller.rb`, `config/routes.rb`, `spec/controllers/api/v1/accounts/canned_response_categories_controller_spec.rb`, `spec/factories/canned_response_categories.rb`.

**Interfaces — Produces:** `GET/POST /canned_response_categories`, `PATCH/DELETE /canned_response_categories/:id`, `PATCH /canned_response_categories/reorder { scope: 'company'|'personal', ids: [] }`. JSON: `{ id, name, position, scope }`, index is a bare array of company + own personal, ordered `position, id`. Same scope/authorization rules as templates (create without `scope` → admin company, others personal).

- [ ] **Step 1: Specs** — `agent sees company and own categories only`, `agent cannot rename a company category` (401), `deleting a category keeps its templates with no category`, `reorder sets positions in the given order`.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Commit** `feat(canned): template categories API`.

### Task 4: Variable engine (frontend, pure)

**Files:** `app/javascript/dashboard/helper/replyTemplates.js`, `app/javascript/dashboard/helper/specs/replyTemplates.spec.js`.

**Interfaces — Produces:**
- `FIELD_TYPES = ['text','long','number','money','date','select','yesno']`
- `getExtraVariables(now = new Date(), account = {})` → `{ 'date.today', 'date.tomorrow', 'date.next_business_day', 'date.in_3_days', 'date.in_7_days', 'time.now', 'time.greeting', 'account.name' }` (dates formatted `en-US { weekday:'short', month:'short', day:'numeric' }`; greeting `Good morning` < 12 ≤ `Good afternoon` < 18 ≤ `Good evening`).
- `parseTokens(content)` → `[{ raw, key, fallback|null, index }]` for every `{{ key | default: "x" }}` (single or double quotes).
- `isSystemKey(key, variables)` → key contains a dot **or** is in `variables`.
- `getTemplateFields(content, definitions = [], variables = {})` → ordered unique agent fields, each `{ key, label, type, required, default, options }`, merging the stored definition over `{ label: humanize(key), type: guessFieldType(key), required: false, default: '', options: [] }`.
- `guessFieldType(key)` → `date` for `/date|deadline/`, `money` for `/amount|price|refund|total|fee|cost/`, `number` for `/days|hours|qty|count/`, `long` for `/note|message|details/`, else `text`.
- `initialFieldValues(fields)` → `{ key: default || (select ? options[0] : '') }`.
- `formatFieldValue(field, value)` → date `YYYY-MM-DD` → formatted like above; money → prefixes `$` when missing; others as-is.
- `resolveTemplate(content, { variables, values, fields })` → string: system key with value → value; system key without value → fallback if given, else the original `{{...}}` token untouched; agent field → formatted value, else fallback, else `''`.
- `missingRequiredFields(fields, values)` → keys.

- [ ] **Step 1: Specs** — one `it` per bullet above, including: `keeps {{contact.email}} when there is no value and no fallback`, `uses the fallback for an empty system variable`, `inserts an empty string for an empty optional agent field`, `formats 2026-10-26 as "Mon, Oct 26"`, `does not treat {{contact.custom_attribute.plan}} as an agent field`.
- [ ] **Step 2: Run** `npx pnpm@10.2.0 vitest run app/javascript/dashboard/helper/specs/replyTemplates.spec.js` → FAIL, implement, → PASS.
- [ ] **Step 3: Commit** `feat(canned): reply template variable engine`.

### Task 5: Dashboard data layer

**Files:** `api/cannedResponse.js`, `api/cannedResponseCategories.js`, `store/modules/cannedResponse.js`, `store/modules/cannedResponseCategories.js`, `store/index.js`, `store/mutation-types.js`, specs under `store/modules/specs/cannedResponses/` and `api/specs/`.

**Interfaces — Produces:**
- API: `CannedResponseAPI` extends `ApiClient` (no IndexedDB cache — per-user data must not be cached account-wide); `use(id)`, `favorite(id)`, `unfavorite(id)`, `reorderFavorites(ids)`. `CannedResponseCategoriesAPI` extends `ApiClient` + `reorder(scope, ids)`.
- Getters: `getCannedResponses`, `getSortedCannedResponses` (unchanged), `getFavoriteCannedResponses` (favorites by `favorite_position`), `getRecentCannedResponses` (by `last_used_at desc`, max 15, only used ones), `getCompanyCannedResponses`, `getPersonalCannedResponses`.
- Actions: existing ones + `markCannedResponseUsed(id)`, `toggleCannedResponseFavorite(id)` (optimistic, reverts on error), `reorderCannedResponseFavorites(ids)` (optimistic). `revalidateCannedResponses({ newKey })` refetches when `newKey` differs from the last seen key (stored in state as `cacheKey`).
- Categories module (namespaced `cannedResponseCategories`): `get`, `create`, `update`, `delete`, `reorder`; getters `getCategories`, `getCompanyCategories`, `getPersonalCategories`.

- [ ] **Step 1: Specs** for the new getters and `toggleCannedResponseFavorite` (commits optimistic flag, reverts on reject).
- [ ] **Step 2: Implement, run vitest on those spec files → PASS.**
- [ ] **Step 3: Commit** `feat(canned): store support for favorites, recents and categories`.

### Task 6: `/` picker + fill dialog

**Files:** `components/widgets/conversation/CannedResponse.vue` (rewrite), `replyTemplates/TemplateFillDialog.vue`, `replyTemplates/TemplateFieldInput.vue`, `WootWriter/Editor.vue`.

**Interfaces:**
- `CannedResponse.vue` keeps props (`caretPosition`, `searchKey`, `variables`, `schema`) and emits `replace(content: string)`, `close`, `removeTrigger`, plus new `fill(template)` when the picked template has agent fields.
- Filters slot: tabs `Favorites · Recent · Mine · Company · All` (default `Favorites` when the user has favorites and the search is empty, else `All`; typing switches an empty Favorites/Recent result to `All`), then category chips for the active tab. Leading slot: star button (`@mousedown.prevent`, `@click.stop` → `toggleCannedResponseFavorite`). Item `title` = template title, `subtitle` = `/short_code · Category` + snippet, `group` unused. Search with `picoSearch` over `shortCode` (weight 2), `title`, `plainText`.
- `TemplateFillDialog.vue` props `{ template, variables }`, emits `insert(content: string)`, `close`. Uses `components-next/dialog/Dialog.vue`; one `TemplateFieldInput` per field (date shows quick chips Today / Tomorrow / Next business day / +3 days / +7 days); live preview with resolved values highlighted; confirm disabled until required fields are filled; `$mod+Enter` inserts.
- `Editor.vue`: on `fill` keep the slash range, open the dialog; on `insert`, call `insertSpecialContent('cannedResponse', content)`; on every insert from the picker or library dispatch `markCannedResponseUsed(id)`. Templates without fields insert immediately (resolved through `resolveTemplate` with `getExtraVariables()` merged into `variables`).

- [ ] **Step 1: Component spec** `TemplateFillDialog.spec.js`: `disables Insert until required fields are filled`, `emits resolved content with the date chip value`.
- [ ] **Step 2: Implement, vitest → PASS, eslint clean on touched files.**
- [ ] **Step 3: Commit** `feat(canned): template picker with tabs, favorites and fill-in fields`.

### Task 7: Template library dialog (`Alt+T`)

**Files:** `replyTemplates/TemplateLibraryDialog.vue`, `WootWriter/Editor.vue` (or `ReplyBox.vue` toolbar — wherever the reply toolbar buttons live), i18n.

**Interfaces:** props `{ variables }`, emits `insert({ id, content })`, `close`. Three columns as in the prototype: tree (Favorites, Recent, All; Company + its categories; Mine + its categories, with counts), list (search across all templates when typing, sort `My order / Most used / Recently used / A → Z`, drag handles to reorder only on Favorites with no search), detail (pin, "Copy to Mine", "Edit" link to settings, fields form, preview, Insert). Opens with `Alt+T` while the reply editor is mounted and from a toolbar button labelled "Templates".

- [ ] **Step 1: Spec** `TemplateLibraryDialog.spec.js`: `typing searches every template even on Favorites`, `reordering favorites dispatches the new id order`.
- [ ] **Step 2: Implement, vitest → PASS.**
- [ ] **Step 3: Commit** `feat(canned): full template library dialog`.

### Task 8: Settings — two libraries and the template editor

**Files:** `routes/dashboard/settings/canned/Index.vue` (rewrite), `TemplateEditorDialog.vue` (new; delete `AddCanned.vue`, `EditCanned.vue`), `cannedMgmt.json`.

**Interfaces:** tabs `Company library` / `My library`; left column categories (add, rename inline, move up, delete with confirm); table columns star · Template (title + snippet with variable chips) · Shortcut · Category · Asks for · Used · actions (Edit, Duplicate/"Copy to Mine", Delete). Agents see the company tab read-only with a "Copy to Mine" action. `TemplateEditorDialog` props `{ template|null, scope }`: Title, Shortcut, Library (company option only for admins), Category (+ new), Message (the existing `WootMessageEditor`/textarea with an **Insert variable** menu grouped Contact / Conversation / Agent / Inbox / Date & time / custom attributes, and **Ask the agent…** which inserts `{{key}}` from a typed label), Fields table synced from the message (label, type, options/default, required), live preview against a sample contact. Saves `variables` = fields still present in the message.

- [ ] **Step 1: Spec** `TemplateEditorDialog.spec.js`: `adds a field row when the message gains {{refund_amount}} and guesses money`, `drops field definitions no longer in the message on save`.
- [ ] **Step 2: Implement, vitest → PASS.**
- [ ] **Step 3: Commit** `feat(canned): settings page for company and personal template libraries`.

### Task 9: Verify on CI

- [ ] Run locally: `npx pnpm@10.2.0 eslint` on touched JS/Vue files and `vitest run` on all new/changed specs.
- [ ] Push `feature/reply-templates` to `origin`; enable Actions on the fork; run the repo's backend workflow (RSpec + Postgres + Redis) for the new/changed specs and the frontend workflow. Fix until green.
- [ ] Commit any fixes; report what CI covered and what it did not (no local Ruby; no UI run against a real backend yet).
