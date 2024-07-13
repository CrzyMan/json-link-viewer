<script>
    import { CodeBlock } from '@skeletonlabs/skeleton';
	import { SvelteSet } from 'svelte/reactivity';

	let trigger_definitions = $state(`teams/{team_UID}/groups/{group_UID}/stages/{stage_IDX} -> teams/{team_UID}/groups/{group_UID}/pipelineDetails/stages/{stage_IDX} : Reduced detail for easy get
teams/{team_UID}/groups/{group_UID}/members/{user_UID}/groupAccess -> users/{user_UID}/groupAccess/{group_UID} : Team access controls the user's access
teams/{team_UID}/groups/{group_UID}/stages/{stage_IDX} -> teams/{team_UID}/groups/{group_UID}/pipelineDetails/stuff/{stage_IDX} : Reduced detail for easy get`);

	/**
	 @typedef {string} SchemaPath e.g. 'path/to/{dynamic}/resource'
	 @typedef {`${SchemaPath} --> ${SchemaPath} : ${string}`} TriggerDefinition e.g. 'source -> effect : relationship'
 	*/
	/**
	 @typedef {{path: SchemaPath, relationship: string}} TriggerEffect
	 @typedef {{key: string, path: SchemaPath, effects?: TriggerEffect[], children: TreeNode[]}} TreeNode
	*/

	/**
	 * Build tree from triggers separated by new lines
	 * @param {string} triggers
	 * @returns {TreeNode}
	 */
	function build_tree(triggers){
		try {
			/** @type {TreeNode} */
			let root = {
				key: 'root',
				path: 'root',
				children: []
			};

			let trigger_defs = /** @type {TriggerDefinition[]} */ (triggers.split(/\n+/).map(t => t.trim()).filter(t => t));

			// Compose the full object
			for (let trigger_def of trigger_defs){
				let [source_path, effect_path, relationship] = trigger_def.split(/ ?-> ?| ?: ?/g);
				let source_props = source_path.split('/').filter(p => p);
				let effect_props = effect_path.split('/').filter(p => p);

				let ref_node = root;
				for (let next_key of source_props){
					let child_node = ref_node.children.find(c => c.key === next_key)
					if (!child_node){
						child_node = {
							key: next_key,
							path: `${ref_node.path}/${next_key}`,
							children: []
						}
						ref_node.children.push(child_node);
					}

					if (next_key == source_props.at(-1)){
						child_node.effects ??= [];
						child_node.effects?.push({
							path: `root/${effect_path}`,
							relationship
						})
					}
					ref_node = child_node;
				}
				ref_node = root;
				for (let next_key of effect_props){
					let child_node = ref_node.children.find(c => c.key === next_key)
					if (!child_node){
						child_node = {
							key: next_key,
							path: `${ref_node.path}/${next_key}`,
							children: []
						};
						ref_node.children.push(child_node);
					}
					ref_node = child_node;
				}
			}
			most_recent_valid_tree = root;
			return root;
		} catch (e) {
			return most_recent_valid_tree;
		}
	}

	/** @type {TreeNode} */
	let most_recent_valid_tree;
	let tree = $derived(build_tree(trigger_definitions));

	/** @type {SvelteSet<string>} */
	let paths_to_highlight = new SvelteSet();

	// let trigger_def_array = $state([]);

	/**
	 @typedef {{
		source_path: string;
		effect_path: string;
		relationship: string;
		arrow_path: string;
	 }} Arrow
	*/

	/** @type {Arrow[]} */
	let arrows = $state([]);

	$effect(() => {
		arrows = generate_arrow_paths(trigger_definitions)
	});

	/** 
	 * @param {string} trigger_definitions
	 * @returns {Arrow[]}
	*/
	function generate_arrow_paths(trigger_definitions){
		// if (typeof document === 'undefined'){
		// 	return [];
		// }

		/** @type {Arrow[]} */
		let result = [];

		let existing_paths = document.querySelectorAll('[data-remove-me]');
		existing_paths.forEach(s => s.remove());
		let trigger_def_array = trigger_definitions.split('\n');
		
		let on_page_svg = document.querySelector('svg');
		console.log(on_page_svg);

		let svg_rect = on_page_svg?.getBoundingClientRect();
		if (!svg_rect) {
			return [];
		}

		on_page_svg?.setAttribute('viewBox', `0 0 ${svg_rect.width} ${svg_rect.height}`);

		for (let trigger_def of trigger_def_array){
			let [source_path, effect_path, relationship] = trigger_def.split(/ ?-> ?| ?: ?/g);
			let source_rect = document.querySelector(`[data-path="root/${source_path}"] .key`)?.getBoundingClientRect();
			let effect_rect = document.querySelector(`[data-path="root/${effect_path}"] .key`)?.getBoundingClientRect();

			if (!source_rect || !effect_rect) break;

			let jutting = 20 + (Math.abs(source_rect.y - effect_rect.y)*0.5)
			
			let arrow_path = `
				M${source_rect.x - svg_rect.x + source_rect.width + 5},${source_rect.y - svg_rect.y + source_rect.height*0.5} 
				C${source_rect.x- svg_rect.x + source_rect.width + 5 + jutting},${source_rect.y - svg_rect.y + source_rect.height*0.5}
				${effect_rect.x- svg_rect.x + effect_rect.width + 5 + jutting},${effect_rect.y - svg_rect.y + effect_rect.height*0.5}
				${effect_rect.x- svg_rect.x + effect_rect.width + 5},${effect_rect.y - svg_rect.y + effect_rect.height*0.5}`;

			/** @type {{source_path: string, effect_path: string, relationship: string, arrow_path: string}} */
			let arrow = {
				source_path,
				effect_path,
				relationship,
				arrow_path
			};
			result.push(arrow);
		}
		return result;
	}
</script>

{#snippet tree_display(/** @type {TreeNode} */ n)}
	{@const root_node = /** @type {TreeNode} */ (n)}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		data-path={root_node.path}
		class="
			relative z-10
			border-l border-solid
		"
	>
		<div 
			class="
				key w-min flex items-center
				{paths_to_highlight.has(root_node.path) ? "bg-yellow-200/50" : ""}
			"
			onmouseenter={() => {
				console.log(`ADDING ${root_node.path}`);
				if (!root_node.effects || (root_node.effects?.length ?? 0) === 0){
					return;
				}
				for (let effect of root_node.effects){
					paths_to_highlight.add(effect.path);
				}
				paths_to_highlight.add(root_node.path);
			}}
			onmouseleave={() => {
				console.log(`DELETING ${root_node.path}`);
				for (let effect of root_node.effects ?? []){
					paths_to_highlight.delete(effect.path);
				}
				paths_to_highlight.delete(root_node.path);
			}}
		>
			{root_node.key}/
		</div>
		<div class="pl-4">
			{#each (root_node.children ?? []) as child_node}
				{@render tree_display(child_node)}
			{:else}
				{@html "{ ... }"}
			{/each}
		</div>
	</div>
{/snippet}

<div class="p-6">
	<textarea class="w-full h-[8rem]" bind:value={trigger_definitions}></textarea>
	<details>
		<summary>Code</summary>
		<CodeBlock language="javascript" code={JSON.stringify(tree, null, 2)}></CodeBlock>
	</details>
	<div class="bg-white rounded px-4 py-2 relative z-0">
		{#each tree.children as root_node}
			{@render tree_display(root_node)}
		{/each}
		<svg class="absolute left-0 right-0 top-0 bottom-0 w-full h-full z-0">
			<defs>
				<marker
					id="arrow"
					viewBox="0 0 10 10"
					refX="9"
					refY="5"
					markerWidth="10"
					markerHeight="10"
					orient="auto-start-reverse"
				>
					<path d="M 0 0 L 10 5 L 0 10 z" />
				</marker>
			</defs>
			{#each arrows as arrow}
				<path
					fill="none"
					stroke={paths_to_highlight.has('root/' + arrow.source_path) ? "yellow" : "transparent"}
					opacity="50%"
					stroke-width="7"
					stroke-linecap="round"
					d={arrow.arrow_path}
				/>
				<path
					fill="none"
					stroke="#000"
					stroke-width="1"
					stroke-linecap="round"
					marker-end="url(#arrow)"
					d={arrow.arrow_path}
				/>
			{/each}
		</svg>
	</div>
</div>
