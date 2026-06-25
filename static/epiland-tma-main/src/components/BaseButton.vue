<template>
	<button
		:class="[
			'w-full py-3 px-2 rounded-xl active:scale-95 transition-all cursor-pointer flex gap-2 items-center font-bold uppercase border-2',
			vertical
				? 'flex-col justify-center text-center'
				: 'flex-row justify-start',
			variants[variant],
		]"
	>
		<div :class="{ 'mb-1': vertical }">
			<slot />
		</div>

		<span
			:class="[
				'leading-tight',
				vertical ? 'text-[10px] sm:text-xs' : 'text-base',
			]"
		>
			{{ label }}
		</span>
	</button>
</template>

<script setup>
const props = defineProps({
	label: String,
	vertical: {
		type: Boolean,
		default: false,
	},
	variant: {
		type: String,
		default: 'secondary',
		validator: (value) => ['primary', 'secondary'].includes(value),
	},
})

// Style Map
const variants = {
	primary: 'bg-[#3c1889] text-white border-[#3c1889] shadow-md',
	secondary: 'bg-white text-[#3c1889] border-[#3c1889]',
}
</script>
