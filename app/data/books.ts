export type Section = {
  id: string;
  number: string;
  title: string;
  plannedAt?: string;
};

export type Chapter = {
  id: string;
  number: string;
  title: string;
  sections: Section[];
};

export type Book = {
  id: string;
  title: string;
  shortTitle: string;
  initiallyComplete: boolean;
  chapters: Chapter[];
};

type SectionInput = string | [title: string, plannedAt: string];
type ChapterInput = [title: string, sections: SectionInput[]];

function makeBook(
  id: string,
  title: string,
  shortTitle: string,
  initiallyComplete: boolean,
  chapterInputs: ChapterInput[],
): Book {
  return {
    id,
    title,
    shortTitle,
    initiallyComplete,
    chapters: chapterInputs.map(([chapterTitle, sections], chapterIndex) => {
      const chapterNumber = chapterIndex + 1;
      return {
        id: `${id}-chapter-${chapterNumber}`,
        number: String(chapterNumber),
        title: chapterTitle,
        sections: sections.map((section, sectionIndex) => {
          const [sectionTitle, plannedAt] = typeof section === "string" ? [section, ""] : section;
          return {
            id: `${id}-${chapterNumber}-${sectionIndex + 1}`,
            number: `${chapterNumber}.${sectionIndex + 1}`,
            title: sectionTitle,
            plannedAt: plannedAt || undefined,
          };
        }),
      };
    }),
  };
}

export const books: Book[] = [
  makeBook("data-structure", "数据结构", "数据结构", true, [
    ["绪论", ["数据结构的基本概念", "算法和算法评价"]],
    ["线性表", ["线性表的定义和基本操作", "线性表的顺序表示", "线性表的链式表示"]],
    ["栈、队列和数组", ["栈", "队列", "栈和队列的应用", "数组和特殊矩阵"]],
    ["串", ["串的定义和实现", "串的模式匹配"]],
    ["树与二叉树", ["树的基本概念", "二叉树的概念", "二叉树的遍历和线索二叉树", "树、森林", "树与二叉树的应用"]],
    ["图", ["图的基本概念", "图的存储及基本操作", "图的遍历", "图的应用"]],
    ["查找", ["查找的基本概念", "顺序查找和折半查找", "树形查找", "B树和B+树", "散列表（Hash）表"]],
    ["排序", ["排序的基本概念", "插入排序", "交换排序", "选择排序", "归并排序、基数排序和计数排序", "各种内部排序算法的比较及应用", "外部排序"]],
  ]),
  makeBook("computer-organization", "计算机组成原理", "计组", true, [
    ["计算机系统概述", ["计算机发展历程", "计算机系统层次结构", "计算机的性能指标"]],
    ["数据的表示和运算", ["数制与编码", "运算方法和运算电路", "浮点数的表示与运算"]],
    ["存储系统", ["存储器概述", "主存储器", "主存储器与CPU的连接", "外部存储器", "高速缓冲存储器", "虚拟存储器"]],
    ["指令系统", ["指令系统", "寻址方式", "程序的机器级表示", "CISC和RISC的基本概念"]],
    ["中央处理器", ["CPU的功能和基本结构", "指令执行过程", "数据通路的功能和基本结构", "控制器的功能和工作原理", "异常和中断机制", "指令流水线", "多处理器的基本概念"]],
    ["总线", ["总线概述", "总线事务和定时"]],
    ["输入/输出系统", ["I/O系统基本概念", "I/O接口", "I/O方式"]],
  ]),
  makeBook("operating-system", "操作系统", "操作系统", false, [
    ["计算机系统概述", [["操作系统的基本概念", "2026-08-01"], ["操作系统发展历程", "2026-08-01"], ["操作系统的运行环境", "2026-08-01"], ["操作系统结构", "2026-08-01"], ["操作系统引导", "2026-08-01"], ["虚拟机", "2026-08-01"]]],
    ["进程与线程", [["进程与线程简介", "2026-08-02"], ["CPU调度", "2026-08-02"], ["同步与互斥", "2026-08-03"], ["死锁", "2026-08-03"]]],
    ["内存管理", [["内存管理概念", "2026-08-04"], ["虚拟内存管理", "2026-08-05"]]],
    ["文件管理", [["文件系统基础", "2026-08-06"], ["目录与文件", "2026-08-06"], ["文件系统", "2026-08-06"]]],
    ["输入/输出管理", [["I/O管理概述", "2026-08-07"], ["设备独立性软件", "2026-08-07"], ["磁盘和固态硬盘", "2026-08-07"]]],
  ]),
  makeBook("computer-network", "计算机网络", "计网", false, [
    ["计算机网络体系结构", ["计算机网络概述", "计算机网络体系结构与参考模型"]],
    ["物理层", ["通信基础", "传输介质", "物理层设备"]],
    ["数据链路层", ["数据链路层的功能", "组帧", "差错控制", "流量控制与可靠传输机制", "介质访问控制", "局域网", "广域网", "数据链路层设备"]],
    ["网络层", ["网络层的功能", "IPv4", "IPv6", "路由算法与路由协议", "IP多播", "移动IP", "网络层设备"]],
    ["传输层", ["传输层提供的服务", "UDP", "TCP"]],
    ["应用层", ["网络应用模型", "域名系统", "文件传输协议", "电子邮件", "万维网"]],
  ]),
];
