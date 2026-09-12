import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from './stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
    // 根路由按登录态分流：未登录 → /login，已登录 → 角色首页。
    // 注意：绝不能写成 redirect: '/' —— 自我重定向会让 Vue Router 在解析阶段无限递归
    // （Maximum call stack size exceeded），且发生在导航守卫之前，守卫无法拦截。
    {
      path: '/',
      redirect: () => {
        const auth = useAuthStore();
        return auth.isLoggedIn ? auth.homePath : '/login';
      },
    },
    // 老师
    { path: '/teacher', component: () => import('./views/teacher/TeacherHome.vue'), meta: { role: 'teacher' } },
    { path: '/teacher/lesson/:id', component: () => import('./views/teacher/LessonReview.vue'), meta: { role: 'teacher' } },
    { path: '/teacher/questions', component: () => import('./views/teacher/TeacherQuestions.vue'), meta: { role: 'teacher' } },
    // 家长
    { path: '/parent', component: () => import('./views/parent/ParentHome.vue'), meta: { role: 'parent' } },
    { path: '/parent/questions', component: () => import('./views/parent/ParentQuestions.vue'), meta: { role: 'parent' } },
    { path: '/parent/renewals', component: () => import('./views/parent/ParentRenewals.vue'), meta: { role: 'parent' } },
    // 主管
    { path: '/supervisor', component: () => import('./views/supervisor/SupervisorHome.vue'), meta: { role: 'supervisor' } },
    { path: '/supervisor/student/:id', component: () => import('./views/supervisor/SupervisorStudent.vue'), meta: { role: 'supervisor' } },
    // 共享：成长轨迹（老师/主管）
    { path: '/growth', component: () => import('./views/GrowthView.vue'), meta: { role: 'staff' } },
    // 未匹配路由：回到根路由，由根路由按登录态分流（/ → /login 或角色首页）
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  // 登录页：已登录用户直接进入角色首页
  if (to.meta.public) {
    if (auth.isLoggedIn) return auth.homePath;
    return true;
  }
  // 其余页面：未登录一律先去登录页
  if (!auth.isLoggedIn) return '/login';
  await auth.loadMeta();
  const need = to.meta.role as string | undefined;
  if (need === 'staff') {
    if (auth.user!.role === 'parent') return auth.homePath;
  } else if (need && auth.user!.role !== need) {
    return auth.homePath;
  }
  return true;
});

export default router;
