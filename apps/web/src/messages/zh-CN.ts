export interface Messages {
  brand: string;
  brandTagline: string;
  nav: {
    today: string;
    essays: string;
    write: string;
    feedback: string;
    lesson: string;
    rewrite: string;
    compare: string;
    growth: string;
    settings: string;
    admin: string;
  };
  common: {
    loading: string;
    retry: string;
    save: string;
    saved: string;
    continue: string;
    backToday: string;
    minutes: string;
    details: string;
    close: string;
  };
}

export const zhCN = {
  brand: "IELTS Writing",
  brandTagline: "把每次错误变成下一次能力",
  nav: {
    today: "今天",
    essays: "我的作文",
    write: "写作室",
    feedback: "批改报告",
    lesson: "专项提升",
    rewrite: "延迟重写",
    compare: "版本对比",
    growth: "成长记录",
    settings: "设置",
    admin: "系统状态",
  },
  common: {
    loading: "正在准备你的学习内容…",
    retry: "重试",
    save: "保存",
    saved: "已保存",
    continue: "继续",
    backToday: "返回今日计划",
    minutes: "分钟",
    details: "查看详情",
    close: "关闭",
  },
} as const satisfies Messages;
