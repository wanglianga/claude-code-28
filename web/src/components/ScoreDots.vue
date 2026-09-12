<script setup lang="ts">
defineProps<{ score: number; max?: number }>();
</script>

<template>
  <span class="dots" :title="`${score}分`">
    <span v-for="i in (max || 5)" :key="i" class="dot" :class="{ on: i <= score }"></span>
  </span>
</template>
