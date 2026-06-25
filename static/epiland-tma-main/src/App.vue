<template>
	<div class="h-screen flex flex-col">
		<header
			class="flex p-4 justify-center items-center w-full bg-[#3c1889] h-10"
		>
			<img
				src="/logo.svg"
				alt="Logo"
				class="h-4 invert"
			/>
		</header>
		<main
			class="p-4 flex flex-col gap-4 h-full"
			v-show="screen === 'home'"
		>
			<BaseButton
				label="Замовити Свято"
				variant="primary"
				@click="screen = 'order'"
				><PartyPopperIcon
			/></BaseButton>
			<BaseButton
				label="Поповнити Картку"
				variant="primary"
				@click="openLink('https://epiland.com/balance-payment/')"
				><CreditCardIcon
			/></BaseButton>
			<BaseButton
				label="Атракціони"
				@click="screen = 'attractions'"
				><FerrisWheelIcon
			/></BaseButton>
			<BaseButton
				label="Кафе"
				@click="openLink('https://pestocafe21.choiceqr.com/')"
				><CoffeeIcon
			/></BaseButton>
			<BaseButton label="Зв'язатися з нами"><PhoneIcon /></BaseButton>
			<BaseButton label="Про нас"><InfoIcon /></BaseButton>
			<div class="flex-1" />
		</main>
		<main
			class="p-4 flex flex-col gap-4 h-full"
			v-show="screen === 'attractions'"
		>
			<BaseButton
				label="Назад"
				variant="primary"
				@click="screen = 'home'"
				><XIcon
			/></BaseButton>
			<div
				class="rounded-xl bg-rose flex flex-col"
				v-for="attraction in attractions"
				:key="attraction.name"
			>
				<img
					class="rounded-t-lg"
					:src="attraction.image"
				/>
				<div class="p-2 flex flex-col gap-2">
					<div class="text-[#7167FF] font-bold text-lg">
						{{ attraction.name }}
					</div>
					<div class="text-[#591A94] text-xs">
						{{ attraction.description }}
					</div>
					<div class="flex gap-4 justify-center items-center">
						<div>
							<div class="text-xs text-[#7167FF]">Пн-Пт<br />Сб-Нд</div>
							<div class="text-[#591A94] text-xs">
								{{ attraction.prices.weekdays }} грн
								{{ attraction.prices.weekends }} грн
							</div>
						</div>
						<div>
							<div class="text-xs text-[#7167FF]">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									class="size-6"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
									/>
								</svg>
							</div>
							<div class="text-[#591A94] text-xs">
								{{
									attraction.prices.sessions == 0
										? 'безлімітне перебування'
										: `${attraction.prices.sessions} сеанс`
								}}
							</div>
						</div>
						<div v-if="attraction.minAge">
							<div class="text-xs text-[#7167FF]">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									class="size-6"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
									/>
								</svg>
							</div>
							<div class="text-[#591A94] text-xs">
								{{ `від ${attraction.minAge} років` }}
							</div>
						</div>
					</div>
				</div>
			</div>
		</main>
		<main v-show="screen === 'order'">
			<BaseButton
				label="Назад"
				variant="primary"
				@click="screen = 'home'"
				><XIcon
			/></BaseButton>
		</main>
	</div>
</template>
<script setup>
import { ref } from 'vue'
import BaseButton from './components/BaseButton.vue'
import {
	HomeIcon,
	UserIcon,
	PartyPopperIcon,
	CreditCardIcon,
	FerrisWheelIcon,
	CoffeeIcon,
	PhoneIcon,
	InfoIcon,
	XIcon,
} from 'lucide-vue-next'

const openLink = (url) => {
	window.open(url, '_blank').opener = null
}

const screen = ref('home')
const attractions = ref([
	{
		name: 'Ігровий майданчик "EPILAND"',
		description:
			'Лабіринт, Батут, Ніндзя парк, Приставки, Тюбінг, Скеледром, Зона іграшок, 4KIDS (вхід лише у шкарпетках)',
		image:
			'https://kyiv.epiland.com/wp-content/uploads/2024/09/utske-1024x683.webp',
		minAge: 0, // Є зона 4KIDS для найменших
		prices: {
			weekdays: 400,
			weekends: 600,
			sessions: 'Безліміт',
		},
	},
	{
		name: 'Лазертаг',
		description:
			'Космічний лабіринт, де гравці змагаються у влучності, використовуючи лазерні бластери та сенсорні жилети.',
		image:
			'https://kyiv.epiland.com/wp-content/uploads/2024/09/utske-1024x683.webp',
		minAge: 6,
		prices: {
			weekdays: 160,
			weekends: 160,
			sessions: 1,
		},
	},
	{
		name: 'Автодром',
		description:
			'Драйвові перегони на сучасних електромобілях, де кожен може відчути себе професійним гонщиком.',
		image:
			'https://kyiv.epiland.com/wp-content/uploads/2024/09/utske-1024x683.webp',
		minAge: 5, // Зазвичай зріст від 110-120 см
		prices: {
			weekdays: 140,
			weekends: 140,
			sessions: 1,
		},
	},
	{
		name: 'Віртуальна реальність (VR)',
		description:
			'Повне занурення у захопливі ігрові світи з неймовірною графікою та ефектом присутності.',
		image:
			'https://kyiv.epiland.com/wp-content/uploads/2024/09/utske-1024x683.webp',
		minAge: 7,
		prices: {
			weekdays: 160,
			weekends: 160,
			sessions: 1,
		},
	},
	{
		name: 'Дзеркальний лабіринт',
		description:
			'Таємничий простір нескінченних відображень, де кожен крок стає справжнім викликом.',
		image:
			'https://kyiv.epiland.com/wp-content/uploads/2024/09/utske-1024x683.webp',
		minAge: 3,
		prices: {
			weekdays: 140,
			weekends: 140,
			sessions: 1,
		},
	},
	{
		name: '7D Кінотеатр',
		description:
			'Відчуйте кожен рух, порив вітру та краплі дощу, ставши частиною неймовірних пригод.',
		image:
			'https://kyiv.epiland.com/wp-content/uploads/2024/09/utske-1024x683.webp',
		minAge: 5,
		prices: {
			weekdays: 140,
			weekends: 140,
			sessions: 1,
		},
	},
	{
		name: 'X-Dride',
		description:
			'Екстремальна поїздка на симуляторі, що дарує відчуття швидкості та драйву.',
		image:
			'https://kyiv.epiland.com/wp-content/uploads/2024/09/utske-1024x683.webp',
		minAge: 6,
		prices: {
			weekdays: 140,
			weekends: 140,
			sessions: 1,
		},
	},
	{
		name: 'Ігрові автомати',
		description:
			'Різноманітні аркади, спортивні та відеосимулятори для дітей та дорослих.',
		image:
			'https://kyiv.epiland.com/wp-content/uploads/2024/09/utske-1024x683.webp',
		minAge: 3,
		prices: {
			weekdays: 45,
			weekends: 45,
			sessions: 1,
		},
	},
	{
		name: 'Тир',
		description: 'Можливість перевірити свою вправність у влучній стрільбі.',
		image:
			'https://kyiv.epiland.com/wp-content/uploads/2024/09/utske-1024x683.webp',
		minAge: 6,
		prices: {
			weekdays: 140,
			weekends: 280,
			sessions: 1,
		},
	},
])
</script>
<style scoped>
.bg-rose {
	background-color: rgb(255, 212, 234);
}
</style>
