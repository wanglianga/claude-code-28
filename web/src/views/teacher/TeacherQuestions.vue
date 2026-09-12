<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, fmtDateTime } from '../../api';
import { useAuthStore } from '../../stores/auth';
import type { Question } from '../../types';
import EvidencePicker from '../../components/EvidencePicker.vue';

const auth = useAuthStore();
const questions = ref<Question[]>([]);
const loading = ref(true);
const error = ref('');

const replyingTo = ref<number | null>(null);
const replyContent = ref('');
const evidenceArtworkIds = ref<number[]>([]);
const evidenceTags = ref<string[]>([]);
const submitting = ref(false);

const typeLabel = computed(() => {
  const map: Record<string, string> = {};
  (auth.meta?.questionTypes || []).forEach((t) => { map[t.key] = t.label; });
  return (k: string) => map[k] || k;
});

async function load() {
  loading.value = true;
  try {
    questions.value = await api('/api/questions');
  } catch {
    /* 请求中断可忽略 */
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const pending = computed(() => questions.value.filter((q) => q.status === 'pending'));
const answered = computed(() => questions.value.filter((q) => q.status === 'answered'));

function startReply(q: Question) {
  replyingTo.value = q.id;
  replyContent.value = '';
  evidenceArtworkIds.value = [];
  evidenceTags.value = [];
  error.value = '';
}

async function submitReply(q: Question) {
  if (!replyContent.value.trim()) { error.value = '请填写回复内容'; return; }
  submitting.value = true;
  error.value = '';
  try {
    await api(`/api/questions/${q.id}/reply`, {
      method: 'POST',
      body: {
        content: replyContent.value,
        evidence_artwork_ids: evidenceArtworkIds.value,
        evidence_tags: evidenceTags.value,
      },
    });
    replyingTo.value = null;
    await load();
  } catch (e: any) {
    error.value = e.message;
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div>
    <h1>家长提问</h1>
    <p class="muted small">回复时可从历史作品与能力标签中选取证据，避免只凭单次作品或主观印象回应。</p>
    <div v-if="loading" class="loading">加载中...</div>
    <template v-else>
      <div v-if="error" class="alert alert-danger mb">{{ error }}</div>

      <h2 class="mt">待回复（{{ pending.length }}）</h2>
      <div v-if="!pending.length" class="empty">没有待回复的提问 🎉</div>
      <div v-for="q in pending" :key="q.id" class="card">
        <div class="flex-between flex-wrap">
          <div class="flex flex-wrap">
            <b>{{ q.student_name }}</b>
            <span class="chip chip-teal">{{ q.class_name }}</span>
            <span class="chip chip-accent">{{ typeLabel(q.type) }}</span>
            <span class="faint small">{{ q.parent_name }} · {{ fmtDateTime(q.created_at) }}</span>
          </div>
        </div>
        <p class="mb" style="margin-top:10px">{{ q.content }}</p>
        <div v-if="replyingTo === q.id">
          <div class="section-band band-teach mb">
            <span class="band-label">教学证据（随回复一并展示给家长）</span>
            <div class="band-body">
              <EvidencePicker :student-id="q.student_id" v-model:artwork-ids="evidenceArtworkIds" v-model:tags="evidenceTags" />
            </div>
          </div>
          <label class="field">
            <span>回复内容</span>
            <textarea v-model="replyContent" class="textarea" style="min-height:110px"
              placeholder="结合所选证据说明孩子的阶段发展情况，给出具体建议..."></textarea>
          </label>
          <div class="flex">
            <button class="btn btn-accent" :disabled="submitting" @click="submitReply(q)">
              {{ submitting ? '提交中...' : '发送回复' }}
            </button>
            <button class="btn btn-ghost" @click="replyingTo = null">取消</button>
          </div>
        </div>
        <button v-else class="btn btn-teal btn-sm" @click="startReply(q)">选择证据并回复</button>
      </div>

      <h2 class="mt">已回复（{{ answered.length }}）</h2>
      <div v-for="q in answered" :key="q.id" class="card">
        <div class="flex flex-wrap">
          <b>{{ q.student_name }}</b>
          <span class="chip chip-teal">{{ q.class_name }}</span>
          <span class="chip">{{ typeLabel(q.type) }}</span>
          <span class="faint small">{{ q.parent_name }} · {{ fmtDateTime(q.created_at) }}</span>
        </div>
        <p class="small" style="margin:8px 0">{{ q.content }}</p>
        <div class="alert alert-info" style="margin-top:8px">
          <div class="small faint mb">{{ q.reply_teacher }} 回复于 {{ fmtDateTime(q.reply_at) }}</div>
          {{ q.reply_content }}
          <div v-if="q.evidence_tags?.length" class="flex flex-wrap mt" style="gap:6px;">
            <span v-for="t in q.evidence_tags" :key="t" class="chip chip-teal">{{ t }}</span>
          </div>
          <div v-if="q.evidence_artworks?.length" class="art-grid mt" style="grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));">
            <div v-for="a in q.evidence_artworks" :key="a.id" class="art-card">
              <img :src="a.image_path" :alt="a.title" />
              <div class="art-meta">
                <div class="art-title">{{ a.title }}</div>
                <div class="faint">{{ a.lesson_date?.slice(0, 10) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
