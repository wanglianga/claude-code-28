<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, fmtDate } from '../api';
import type { EvidenceArtwork } from '../types';
import ScoreDots from './ScoreDots.vue';

const props = defineProps<{ studentId: number }>();
const artworkIds = defineModel<number[]>('artworkIds', { default: () => [] });
const tags = defineModel<string[]>('tags', { default: () => [] });

const artworks = ref<EvidenceArtwork[]>([]);
const allTags = ref<string[]>([]);
const loading = ref(true);

onMounted(async () => {
  try {
    const data = await api<{ artworks: EvidenceArtwork[]; tags: string[] }>(
      `/api/students/${props.studentId}/evidence-options`);
    artworks.value = data.artworks;
    allTags.value = data.tags;
  } finally {
    loading.value = false;
  }
});

function toggleArt(id: number) {
  const i = artworkIds.value.indexOf(id);
  if (i >= 0) artworkIds.value.splice(i, 1);
  else if (artworkIds.value.length < 4) artworkIds.value.push(id);
}

function toggleTag(t: string) {
  const i = tags.value.indexOf(t);
  if (i >= 0) tags.value.splice(i, 1);
  else tags.value.push(t);
}
</script>

<template>
  <div>
    <div v-if="loading" class="small faint">加载历史作品...</div>
    <template v-else>
      <div class="small muted mb">从历史作品中选择对比证据（最多4幅）：</div>
      <div class="evidence-grid">
        <div v-for="a in artworks" :key="a.id" class="evidence-item"
          :class="{ picked: artworkIds.includes(a.id) }" @click="toggleArt(a.id)">
          <img :src="a.image_path" :alt="a.title" />
          <div class="evidence-meta">
            <div class="small" style="font-weight:600">{{ a.title }}</div>
            <div class="faint" style="font-size:11px">{{ fmtDate(a.lesson_date) }}</div>
          </div>
          <div class="evidence-check">{{ artworkIds.includes(a.id) ? '✓' : '' }}</div>
        </div>
        <div v-if="!artworks.length" class="empty">该学生暂无历史作品</div>
      </div>
      <div class="small muted mt mb">选择能力标签作为证据：</div>
      <div class="flex flex-wrap" style="gap:6px;">
        <button v-for="t in allTags" :key="t" type="button" class="tag-btn" :class="{ on: tags.includes(t) }"
          @click="toggleTag(t)">{{ t }}</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.evidence-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
  max-height: 260px;
  overflow: auto;
}
.evidence-item {
  position: relative;
  border: 2px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  background: #fff;
}
.evidence-item.picked { border-color: var(--accent); }
.evidence-item img { width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block; }
.evidence-meta { padding: 4px 8px; }
.evidence-check {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(255, 253, 247, 0.9);
  border: 1.5px solid var(--line);
  color: var(--accent-deep);
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
}
.evidence-item.picked .evidence-check { background: var(--accent); color: #fff; border-color: var(--accent); }
.tag-btn {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 999px;
  padding: 3px 12px;
  font-size: 12.5px;
  font-family: inherit;
  cursor: pointer;
  color: var(--ink-soft);
}
.tag-btn.on { background: var(--teal); border-color: var(--teal); color: #fff; }
</style>
