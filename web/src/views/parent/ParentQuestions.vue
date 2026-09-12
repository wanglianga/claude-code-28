<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, fmtDateTime } from '../../api';
import { useAuthStore } from '../../stores/auth';
import type { Question, StudentSummary } from '../../types';

const auth = useAuthStore();
const questions = ref<Question[]>([]);
const students = ref<StudentSummary[]>([]);
const loading = ref(true);

const studentId = ref<number | null>(null);
const qType = ref('slow_progress');
const content = ref('');
const error = ref('');
const success = ref('');
const submitting = ref(false);

const typeLabel = computed(() => {
  const map: Record<string, string> = {};
  (auth.meta?.questionTypes || []).forEach((t) => { map[t.key] = t.label; });
  return (k: string) => map[k] || k;
});

async function load() {
  [questions.value, students.value] = await Promise.all([
    api('/api/questions'),
    api('/api/students'),
  ]);
  if (!studentId.value && students.value.length) studentId.value = students.value[0].id;
  loading.value = false;
}
onMounted(load);

async function submit() {
  error.value = '';
  success.value = '';
  if (!content.value.trim()) { error.value = '请填写问题内容'; return; }
  submitting.value = true;
  try {
    await api('/api/questions', {
      method: 'POST',
      body: { student_id: studentId.value, type: qType.value, content: content.value },
    });
    content.value = '';
    success.value = '已提交，老师回复后会显示在下方';
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
    <h1>提问与老师回复</h1>
    <p class="muted small">对「进步慢」「作品不像样」「是否适合升班」等疑问，老师会结合历史作品与能力标签给出有证据的回复。</p>

    <div class="card">
      <h3>向老师提问</h3>
      <div class="grid grid-2">
        <label class="field">
          <span>孩子</span>
          <select v-model="studentId" class="select">
            <option v-for="s in students" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </label>
        <label class="field">
          <span>问题类型</span>
          <select v-model="qType" class="select">
            <option v-for="t in auth.meta?.questionTypes || []" :key="t.key" :value="t.key">{{ t.label }}</option>
          </select>
        </label>
      </div>
      <label class="field">
        <span>问题内容</span>
        <textarea v-model="content" class="textarea" placeholder="例如：感觉孩子最近进步不明显，是不是不适合继续学？"></textarea>
      </label>
      <div v-if="error" class="alert alert-danger mb">{{ error }}</div>
      <div v-if="success" class="alert alert-info mb">{{ success }}</div>
      <button class="btn btn-accent" :disabled="submitting" @click="submit">
        {{ submitting ? '提交中...' : '提交问题' }}
      </button>
    </div>

    <h2 class="mt">历史提问（{{ questions.length }}）</h2>
    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="!questions.length" class="empty">还没有提问记录</div>
    <div v-for="q in questions" :key="q.id" class="card">
      <div class="flex flex-wrap">
        <b>{{ q.student_name }}</b>
        <span class="chip chip-accent">{{ typeLabel(q.type) }}</span>
        <span class="faint small">{{ fmtDateTime(q.created_at) }}</span>
        <span class="chip" :class="q.status === 'answered' ? 'chip-ok' : 'chip-gold'">
          {{ q.status === 'answered' ? '老师已回复' : '等待老师回复' }}
        </span>
      </div>
      <p style="margin:10px 0 0">{{ q.content }}</p>

      <div v-if="q.status === 'answered'" class="reply-box">
        <div class="small faint mb">{{ q.reply_teacher }} · {{ fmtDateTime(q.reply_at) }}</div>
        <p style="margin:0">{{ q.reply_content }}</p>
        <div v-if="q.evidence_tags?.length" class="mt">
          <div class="small muted mb">老师标注的能力证据：</div>
          <div class="flex flex-wrap" style="gap:6px;">
            <span v-for="t in q.evidence_tags" :key="t" class="chip chip-teal">{{ t }}</span>
          </div>
        </div>
        <div v-if="q.evidence_artworks?.length" class="mt">
          <div class="small muted mb">老师选取的历史作品对比：</div>
          <div class="art-grid" style="grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));">
            <div v-for="a in q.evidence_artworks" :key="a.id" class="art-card">
              <img :src="a.image_path" :alt="a.title" />
              <div class="art-meta">
                <div class="art-title">{{ a.title }}</div>
                <div class="faint">{{ a.lesson_date?.slice(0, 10) }} · {{ a.theme }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reply-box {
  margin-top: 12px;
  background: var(--teal-soft);
  border-radius: 12px;
  padding: 14px 16px;
}
</style>
