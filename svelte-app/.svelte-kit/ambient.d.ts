
// this file is generated — do not edit it


/// <reference types="@sveltejs/kit" />

/**
 * Environment variables [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env`. Like [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private), this module cannot be imported into client-side code. This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured).
 * 
 * _Unlike_ [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private), the values exported from this module are statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * ```ts
 * import { API_KEY } from '$env/static/private';
 * ```
 * 
 * Note that all environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * 
 * ```
 * MY_FEATURE_FLAG=""
 * ```
 * 
 * You can override `.env` values from the command line like so:
 * 
 * ```sh
 * MY_FEATURE_FLAG="enabled" npm run dev
 * ```
 */
declare module '$env/static/private' {
	export const NVM_INC: string;
	export const MAIL_PORT: string;
	export const APP_DB_SECRET: string;
	export const NODE: string;
	export const PYENV_ROOT: string;
	export const NVM_CD_FLAGS: string;
	export const INIT_CWD: string;
	export const SHELL: string;
	export const TERM: string;
	export const APP_LOG_DIR: string;
	export const TMPDIR: string;
	export const HOMEBREW_REPOSITORY: string;
	export const APP_DB_NAME: string;
	export const npm_config_global_prefix: string;
	export const TERM_SESSION_ID: string;
	export const COLOR: string;
	export const npm_config_noproxy: string;
	export const APP_DB_HOST: string;
	export const npm_config_local_prefix: string;
	export const PROCESS_LAUNCHED_BY_Q: string;
	export const USER: string;
	export const NVM_DIR: string;
	export const COMMAND_MODE: string;
	export const npm_config_globalconfig: string;
	export const SSH_AUTH_SOCK: string;
	export const __CF_USER_TEXT_ENCODING: string;
	export const npm_execpath: string;
	export const PATH: string;
	export const TERMINAL_EMULATOR: string;
	export const _: string;
	export const npm_package_json: string;
	export const __CFBundleIdentifier: string;
	export const npm_config_init_module: string;
	export const npm_config_userconfig: string;
	export const PWD: string;
	export const npm_command: string;
	export const JAVA_HOME: string;
	export const EDITOR: string;
	export const npm_lifecycle_event: string;
	export const LANG: string;
	export const APP_DB_PORT: string;
	export const npm_package_name: string;
	export const XPC_FLAGS: string;
	export const npm_config_npm_version: string;
	export const APP_HOME: string;
	export const FORCE_COLOR: string;
	export const npm_config_node_gyp: string;
	export const XPC_SERVICE_NAME: string;
	export const npm_package_version: string;
	export const HOME: string;
	export const SHLVL: string;
	export const PYENV_SHELL: string;
	export const APP_PORT: string;
	export const HOMEBREW_PREFIX: string;
	export const PROCESS_LAUNCHED_BY_CW: string;
	export const LOGNAME: string;
	export const CAS_BASE_URL: string;
	export const npm_config_cache: string;
	export const npm_lifecycle_script: string;
	export const LC_CTYPE: string;
	export const NVM_BIN: string;
	export const SCHEDULER_NAME: string;
	export const npm_config_user_agent: string;
	export const HOMEBREW_CELLAR: string;
	export const INFOPATH: string;
	export const OSLogRateLimit: string;
	export const MAIL_HOST: string;
	export const FIG_TERM: string;
	export const npm_config_prefix: string;
	export const npm_node_execpath: string;
	export const NODE_ENV: string;
}

/**
 * Similar to [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private), except that it only includes environment variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`), and can therefore safely be exposed to client-side code.
 * 
 * Values are replaced statically at build time.
 * 
 * ```ts
 * import { PUBLIC_BASE_URL } from '$env/static/public';
 * ```
 */
declare module '$env/static/public' {
	
}

/**
 * This module provides access to runtime environment variables, as defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`. This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured).
 * 
 * This module cannot be imported into client-side code.
 * 
 * ```ts
 * import { env } from '$env/dynamic/private';
 * console.log(env.DEPLOYMENT_SPECIFIC_VARIABLE);
 * ```
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` always includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 */
declare module '$env/dynamic/private' {
	export const env: {
		NVM_INC: string;
		MAIL_PORT: string;
		APP_DB_SECRET: string;
		NODE: string;
		PYENV_ROOT: string;
		NVM_CD_FLAGS: string;
		INIT_CWD: string;
		SHELL: string;
		TERM: string;
		APP_LOG_DIR: string;
		TMPDIR: string;
		HOMEBREW_REPOSITORY: string;
		APP_DB_NAME: string;
		npm_config_global_prefix: string;
		TERM_SESSION_ID: string;
		COLOR: string;
		npm_config_noproxy: string;
		APP_DB_HOST: string;
		npm_config_local_prefix: string;
		PROCESS_LAUNCHED_BY_Q: string;
		USER: string;
		NVM_DIR: string;
		COMMAND_MODE: string;
		npm_config_globalconfig: string;
		SSH_AUTH_SOCK: string;
		__CF_USER_TEXT_ENCODING: string;
		npm_execpath: string;
		PATH: string;
		TERMINAL_EMULATOR: string;
		_: string;
		npm_package_json: string;
		__CFBundleIdentifier: string;
		npm_config_init_module: string;
		npm_config_userconfig: string;
		PWD: string;
		npm_command: string;
		JAVA_HOME: string;
		EDITOR: string;
		npm_lifecycle_event: string;
		LANG: string;
		APP_DB_PORT: string;
		npm_package_name: string;
		XPC_FLAGS: string;
		npm_config_npm_version: string;
		APP_HOME: string;
		FORCE_COLOR: string;
		npm_config_node_gyp: string;
		XPC_SERVICE_NAME: string;
		npm_package_version: string;
		HOME: string;
		SHLVL: string;
		PYENV_SHELL: string;
		APP_PORT: string;
		HOMEBREW_PREFIX: string;
		PROCESS_LAUNCHED_BY_CW: string;
		LOGNAME: string;
		CAS_BASE_URL: string;
		npm_config_cache: string;
		npm_lifecycle_script: string;
		LC_CTYPE: string;
		NVM_BIN: string;
		SCHEDULER_NAME: string;
		npm_config_user_agent: string;
		HOMEBREW_CELLAR: string;
		INFOPATH: string;
		OSLogRateLimit: string;
		MAIL_HOST: string;
		FIG_TERM: string;
		npm_config_prefix: string;
		npm_node_execpath: string;
		NODE_ENV: string;
		[key: `PUBLIC_${string}`]: undefined;
		[key: `${string}`]: string | undefined;
	}
}

/**
 * Similar to [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private), but only includes variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`), and can therefore safely be exposed to client-side code.
 * 
 * Note that public dynamic environment variables must all be sent from the server to the client, causing larger network requests — when possible, use `$env/static/public` instead.
 * 
 * ```ts
 * import { env } from '$env/dynamic/public';
 * console.log(env.PUBLIC_DEPLOYMENT_SPECIFIC_VARIABLE);
 * ```
 */
declare module '$env/dynamic/public' {
	export const env: {
		[key: `PUBLIC_${string}`]: string | undefined;
	}
}
