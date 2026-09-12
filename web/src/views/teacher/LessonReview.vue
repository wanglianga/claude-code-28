<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api, fmtDate } from '../../api';
import { useAuthStore } from '../../stores/auth';

const route = useRoute();
const auth = useAuthStore();
const lessonId = Number(route.params.id);

const lesson = ref<any>(null);
const error = ref('');
const success = ref('');
const submitting = ref(false);

const studentId = ref<number | null>(null);
const title = ref('');
const imageData = ref('');
const imageName = ref('');
const scores = ref<Record<string, number>>({
  composition: 3, line_score: 3, color: 3, observation: 3, creativity: 3, focus: 3,
});
const needHome = ref(false);
const homeNote = ref('');
const suggestion = ref('');
const nextPrep = ref('');
const classState = ref('');

const dims = computed(() => auth.meta?.dimensions || []);

async function load() {
  lesson.value = await api(`/api/classes/lessons/${lessonId}`);
  const next = lesson.value.students.find((s: any) => !s.review_id && s.attendance !== 'absent');
  studentId.value = next ? next.id : null;
}

onMounted(load);

const currentStudent = computed(() =>
  lesson.value?.students.find((s: any) => s.id === studentId.value));

function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (file.size > 6 * 1024 * 1024) {
    error.value = '图片不能超过6MB';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    imageData.value = String(reader.result);
    imageName.value = file.name;
  };
  reader.readAsDataURL(file);
}

async function submit() {
  error.value = '';
  success.value = '';
  if (!studentId.value) { error.value = '请选择学生'; return; }
  if (!suggestion.value.trim()) { error.value = '请填写本次作品的具体建议'; return; }
  submitting.value = true;
  try {
    await api(`/api/classes/lessons/${lessonId}/reviews`, {
      method: 'POST',
      body: {
        student_id: studentId.value,
        title: title.value.trim(),
        image_data: imageData.value || undefined,
        scores: scores.value,
        need_home_practice: needHome.value,
        home_practice_note: homeNote.value.trim(),
        suggestion: suggestion.value.trim(),
        next_prep: nextPrep.value.trim(),
        class_state: classState.value.trim(),
      },
    });
    success.value = `已保存 ${currentStudent.value?.name} 的点评`;
    title.value = ''; imageData.value = ''; imageName.value = '';
    suggestion.value = ''; nextPrep.value = ''; classState.value = ''; homeNote.value = '';
    needHome.value = false;
    scores.value = { composition: 3, line_score: 3, color: 3, observation: 3, creativity: 3, focus: 3 };
    await load();
  } catch (e: any) {
    error.value = e.message;
  } finally {
    submitting.value = false;
  }
}

const attLabel: Record<string, string> = { present: '到课', absent: '缺勤', leave: '请假', makeup: '补课' };
</script>

<template>
  <div>
    <div v-if="!lesson" class="loading">加载课程...</div>
    <template v-else>
      <div class="flex-between mb flex-wrap">
        <div>
          <h1 style="margin:0">课后点评 · {{ lesson.theme }}</h1>
          <div class="muted small mt">
            {{ lesson.class_name }} · {{ fmtDate(lesson.lesson_date) }} · 阶段目标：{{ lesson.stage }} · 任课：{{ lesson.teacher_name }}
          </div>
        </div>
        <RouterLink to="/teacher" class="btn btn-ghost btn-sm">← 返回班级</RouterLink>
      </div>

      <div class="grid" style="grid-template-columns: 300px 1fr;">
        <div class="card">
          <h3>本班学生</h3>
          <div v-for="s in lesson.students" :key="s.id" class="stu-row"
            :class="{ active: studentId === s.id, done: !!s.review_id }"
            @click="!s.review_id && (studentId = s.id)">
            <div>
              <b>{{ s.name }}</b>
              <span class="chip" :class="s.attendance === 'absent' ? 'chip-danger' : s.attendance === 'leave' ? 'chip-gold' : 'chip-teal'"
                style="margin-left:6px">{{ attLabel[s.attendance] || '未登记' }}</span>
            </div>
            <span v-if="s.review_id" class="chip chip-ok">已点评</span>
            <span v-else-if="s.attendance === 'absent'" class="chip">缺勤免评</span>
            <span v-else class="chip chip-accent">待点评</span>
          </div>
        </div>

        <div class="card">
          <h3>上传作品照片并点评<span v-if="currentStudent"> · {{ currentStudent.name }}</span></h3>
          <div v-if="!studentId" class="empty">本节课所有到课学生均已完成点评 🎉</div>
          <form v-else @submit.prevent="submit">
            <div class="grid grid-2">
              <label class="field">
                <span>作品照片（不上传则使用占位图）</span>
                <input type="file" accept="image/*" class="input" @change="onFile" />
              </label>
              <label class="field">
                <span>作品标题（默认取课程主题）</span>
                <input v-model="title" class="input" :placeholder="lesson.theme" />
              </label>
            </div>
            <div v-if="imageData" class="mb">
              <img :src="imageData" style="max-height:180px; border-radius:10px; border:1px solid var(--line);" />
              <span class="small faint" style="margin-left:8px">{{ imageName }}</span>
            </div>

            <div class="score-grid mb">
              <div v-for="d in dims" :key="d.key" class="score-row">
                <span class="score-label">{{ d.label }}</span>
                <div class="score-btns">
                  <button v-for="n in 5" :key="n" type="button" class="score-btn"
                    :class="{ on: scores[d.key] >= n }" @click="scores[d.key] = n">{{ n }}</button>
                </div>
              </div>
            </div>

            <label class="field">
              <span>本次作品的具体建议（家长可见）*</span>
              <textarea v-model="suggestion" class="textarea" placeholder="例如：主体构图比上次更饱满，建议下次注意画面留白..."></textarea>
            </label>
            <div class="grid grid-2">
              <label class="field">
                <span>下次课程准备（家长可见）</span>
                <textarea v-model="nextPrep" class="textarea" style="min-height:64px" placeholder="例如：下次课带水粉围裙..."></textarea>
              </label>
              <label class="field">
                <span>课堂状态（家长可见）</span>
                <textarea v-model="classState" class="textarea" style="min-height:64px" placeholder="例如：整节课投入，后半段略有分心..."></textarea>
              </label>
            </div>
            <div class="flex mb">
              <label class="flex" style="gap:8px; cursor:pointer;">
                <input type="checkbox" v-model="needHome" />
                <span>需要家庭练习</span>
              </label>
              <input v-if="needHome" v-model="homeNote" class="input grow" placeholder="家庭练习建议，如：每天5分钟线条练习" />
            </div>

            <div v-if="error" class="alert alert-danger mb">{{ error }}</div>
            <div v-if="success" class="alert alert-info mb">{{ success }}</div>
            <button class="btn btn-accent" :disabled="submitting">
              {{ submitting ? '保存中...' : '保存点评并继续下一位' }}
            </button>
          </form>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.stu-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 10px;
  border-radius: 10px;
  cursor: pointer;
  border: 1px solid transparent;
}
.stu-row:hover { background: #faf4e8; }
.stu-row.active { border-color: var(--accent); background: #fdf1ea; }
.stu-row.done { opacity: 0.75; cursor: default; }
.score-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
.score-row { display: flex; align-items: center; gap: 12px; }
.score-label { width: 64px; font-size: 13.5px; color: var(--ink-soft); }
.score-btns { display: flex; gap: 5px; }
.score-btn {
  width: 34px; height: 30px;
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 8px;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  color: var(--ink-soft);
}
.score-btn.on { background: var(--accent); border-color: var(--accent); color: #fff; }
@media (max-width: 900px) { .score-grid { grid-template-columns: 1fr; } }
</style>
