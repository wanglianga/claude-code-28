<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();
const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

const demoAccounts = [
  { u: 'teacher', p: 'teacher123', label: '王慧老师（启蒙A班）' },
  { u: 'teacher2', p: 'teacher123', label: '李岚老师（基础B班）' },
  { u: 'teacher3', p: 'teacher123', label: '赵铭老师（提高C班）' },
  { u: 'supervisor', p: 'supervisor123', label: '张主管（教学主管）' },
  { u: 'parent1', p: 'parent123', label: '陈小明妈妈（家长）' },
  { u: 'parent5', p: 'parent123', label: '黄思远爸爸（家长·退费风险案例）' },
];

async function submit() {
  if (!username.value || !password.value) {
    error.value = '请输入用户名和密码';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    await auth.login(username.value, password.value);
    router.push(auth.homePath);
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function fill(u: string, p: string) {
  username.value = u;
  password.value = p;
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-brand">
        <span style="font-size:34px">🎨</span>
        <h1 style="margin:6px 0 2px">艺芽美术</h1>
        <div class="muted">城市美术培训班 · 作品点评与升班评估系统</div>
      </div>
      <form @submit.prevent="submit">
        <label class="field">
          <span>用户名</span>
          <input v-model="username" class="input" placeholder="请输入用户名" autocomplete="username" />
        </label>
        <label class="field">
          <span>密码</span>
          <input v-model="password" type="password" class="input" placeholder="请输入密码" autocomplete="current-password" />
        </label>
        <div v-if="error" class="alert alert-danger mb">{{ error }}</div>
        <button class="btn btn-accent" style="width:100%; justify-content:center" :disabled="loading">
          {{ loading ? '登录中...' : '登 录' }}
        </button>
      </form>
      <div class="demo-box">
        <div class="small faint mb">演示账号（点击填充）：</div>
        <div class="demo-grid">
          <button v-for="a in demoAccounts" :key="a.u" type="button" class="demo-btn" @click="fill(a.u, a.p)">
            {{ a.label }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    radial-gradient(circle at 15% 20%, rgba(224, 120, 86, 0.12), transparent 40%),
    radial-gradient(circle at 85% 75%, rgba(47, 111, 106, 0.12), transparent 40%),
    var(--bg);
}
.login-card {
  width: 420px;
  max-width: 100%;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: var(--shadow-lg);
  padding: 34px 32px;
}
.login-brand { text-align: center; margin-bottom: 22px; }
.demo-box { margin-top: 22px; border-top: 1px dashed var(--line); padding-top: 14px; }
.demo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.demo-btn {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 12px;
  font-family: inherit;
  color: var(--ink-soft);
  cursor: pointer;
  text-align: left;
}
.demo-btn:hover { border-color: var(--accent); color: var(--accent-deep); }
</style>
