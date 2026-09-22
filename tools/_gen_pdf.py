# -*- coding: utf-8 -*-
"""生成《投资融资招标书.pdf》 — Browser Game Engine（基于 PRD一页纸.md）"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph,
                                Spacer, Table, TableStyle, PageBreak, KeepTogether)

# ---------- fonts ----------
FD = r"C:\Windows\Fonts"
pdfmetrics.registerFont(TTFont("MSYH", os.path.join(FD, "msyh.ttc"), subfontIndex=0))
try:
    pdfmetrics.registerFont(TTFont("MSYH-B", os.path.join(FD, "msyhbd.ttc"), subfontIndex=0))
except Exception:
    pdfmetrics.registerFont(TTFont("MSYH-B", os.path.join(FD, "simhei.ttf")))
pdfmetrics.registerFont(TTFont("SimHei", os.path.join(FD, "simhei.ttf")))

# ---------- palette ----------
NAVY = colors.HexColor("#0F2A4A")
NAVY2 = colors.HexColor("#16385F")
CYAN = colors.HexColor("#0891B2")
GREEN = colors.HexColor("#0E9F6E")
AMBER = colors.HexColor("#B45309")
INK = colors.HexColor("#1B2A3A")
MUT = colors.HexColor("#5C6B7E")
LINE = colors.HexColor("#D5DFEA")
BGROW = colors.HexColor("#F2F6FA")
CHIP = colors.HexColor("#E6F4FB")

W, H = A4

# ---------- styles ----------
def st(name, **kw):
    base = dict(fontName="MSYH", fontSize=10, leading=16, textColor=INK,
                alignment=TA_JUSTIFY, spaceAfter=4)
    base.update(kw)
    return ParagraphStyle(name, **base)

S_TITLE = st("t", fontName="MSYH-B", fontSize=30, leading=42, textColor=colors.white, alignment=TA_LEFT)
S_SUB = st("sub", fontSize=13, leading=20, textColor=colors.HexColor("#BFD4E8"), alignment=TA_LEFT)
S_H1 = st("h1", fontName="MSYH-B", fontSize=15, leading=22, textColor=NAVY, spaceBefore=10, spaceAfter=6)
S_H2 = st("h2", fontName="MSYH-B", fontSize=11.5, leading=18, textColor=CYAN, spaceBefore=6, spaceAfter=3)
S_BODY = st("b")
S_NOTE = st("note", fontSize=8.5, leading=13, textColor=MUT)
S_TH = st("th", fontName="MSYH-B", fontSize=9, leading=13, textColor=colors.white, alignment=TA_CENTER, spaceAfter=0)
S_TD = st("td", fontSize=9, leading=13.5, spaceAfter=0)
S_TDC = st("tdc", fontSize=9, leading=13.5, alignment=TA_CENTER, spaceAfter=0)
S_TDB = st("tdb", fontName="MSYH-B", fontSize=9, leading=13.5, spaceAfter=0)

def tbl(data, colw, header=True, align_center_cols=(), fs_note=False):
    rows = []
    for r, row in enumerate(data):
        out = []
        for c, cell in enumerate(row):
            if isinstance(cell, Paragraph):
                out.append(cell)
            else:
                if header and r == 0:
                    out.append(Paragraph(str(cell), S_TH))
                elif c in align_center_cols:
                    out.append(Paragraph(str(cell), S_TDC))
                else:
                    out.append(Paragraph(str(cell), S_TD))
        rows.append(out)
    t = Table(rows, colWidths=colw, repeatRows=1 if header else 0)
    style = [
        ("GRID", (0, 0), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), NAVY)]
        for i in range(2, len(data), 2):
            style.append(("BACKGROUND", (0, i), (-1, i), BGROW))
    return Table(rows, colWidths=colw, repeatRows=1 if header else 0, style=TableStyle(style))

# ---------- page decoration ----------
def cover(canv, doc):
    canv.saveState()
    canv.setFillColor(NAVY)
    canv.rect(0, 0, W, H, stroke=0, fill=1)
    canv.setFillColor(NAVY2)
    canv.rect(0, H - 60 * mm, W, 60 * mm, stroke=0, fill=1)
    # decorative layers (vector)
    canv.setFillColor(colors.HexColor("#35D6FF"))
    canv.setFillAlpha(0.16)
    canv.saveState(); canv.translate(W - 70 * mm, 90 * mm); canv.skew(0, 18)
    canv.rect(0, 0, 62 * mm, 14 * mm, stroke=0, fill=1)
    canv.setFillColor(colors.HexColor("#3BE08F")); canv.translate(7 * mm, 13 * mm)
    canv.rect(0, 0, 62 * mm, 14 * mm, stroke=0, fill=1)
    canv.setFillColor(colors.HexColor("#FFC24B")); canv.translate(7 * mm, 13 * mm)
    canv.rect(0, 0, 62 * mm, 14 * mm, stroke=0, fill=1)
    canv.restoreState()
    canv.setFillAlpha(1)
    canv.setFillColor(colors.HexColor("#35D6FF"))
    canv.setFont("MSYH-B", 13)
    canv.drawString(25 * mm, H - 55 * mm, "BROWSER  GAME  ENGINE")
    canv.setFillColor(colors.white)
    canv.setFont("MSYH-B", 34)
    canv.drawString(25 * mm, H - 78 * mm, "投资融资招标书")
    canv.setFont("MSYH", 15)
    canv.setFillColor(colors.HexColor("#BFD4E8"))
    canv.drawString(25 * mm, H - 90 * mm, "浏览器端自研 3D 游戏引擎 —— 对标 Unity6 的完整开发闭环")
    canv.setFont("MSYH", 11)
    canv.setFillColor(colors.HexColor("#8FA3BC"))
    canv.drawString(25 * mm, H - 100 * mm, "零后端算力 · 零运行时依赖 · 无构建步骤 · 纯 ES2022")
    canv.setStrokeColor(colors.HexColor("#2C4B77")); canv.setLineWidth(0.8)
    canv.line(25 * mm, H - 110 * mm, W - 25 * mm, H - 110 * mm)
    info = [
        ("项目名称", "Browser Game Engine（浏览器端自研 3D 游戏引擎）"),
        ("文件性质", "投资融资暨 v2 开发招标"),
        ("编制依据", "《Browser Game Engine — PRD 一页纸》v2（2026-09-04）"),
        ("发布日期", "2026 年 9 月 4 日"),
        ("文件密级", "内部资料 · 评审专用"),
    ]
    y = H - 125 * mm
    canv.setFont("MSYH-B", 10.5)
    canv.setFillColor(colors.HexColor("#35D6FF"))
    canv.drawString(25 * mm, y, "文 件 信 息")
    y -= 8 * mm
    canv.setStrokeColor(colors.HexColor("#2C4B77"))
    for k, v in info:
        canv.setFillColor(colors.HexColor("#8FA3BC")); canv.setFont("MSYH-B", 10)
        canv.drawString(25 * mm, y, k)
        canv.setFillColor(colors.white); canv.setFont("MSYH", 10)
        canv.drawString(52 * mm, y, v)
        canv.line(25 * mm, y - 3.2 * mm, W - 25 * mm, y - 3.2 * mm)
        y -= 9 * mm
    canv.setFont("MSYH", 9)
    canv.setFillColor(colors.HexColor("#6E829C"))
    canv.drawString(25 * mm, 20 * mm, "本文件包含前瞻性陈述与拟定商务条款，最终以正式合同为准。")
    canv.restoreState()

def later(canv, doc):
    canv.saveState()
    canv.setStrokeColor(LINE); canv.setLineWidth(0.6)
    canv.line(18 * mm, 14 * mm, W - 18 * mm, 14 * mm)
    canv.setFont("MSYH", 8); canv.setFillColor(MUT)
    canv.drawString(18 * mm, 9 * mm, "Browser Game Engine · 投资融资招标书 · 内部资料")
    canv.drawRightString(W - 18 * mm, 9 * mm, "第 %d 页" % canv.getPageNumber())
    canv.setFillColor(NAVY)
    canv.rect(0, H - 10 * mm, W, 10 * mm, stroke=0, fill=1)
    canv.setFillColor(colors.HexColor("#9FC3E0")); canv.setFont("MSYH", 8)
    canv.drawString(18 * mm, H - 7.2 * mm, "BROWSER GAME ENGINE — 投资融资招标书（2026-09）")
    canv.restoreState()

doc = BaseDocTemplate(r"c:\Users\bnna7\workspace\gameEngineJS\投资融资招标书.pdf",
                      pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                      topMargin=18 * mm, bottomMargin=20 * mm,
                      title="Browser Game Engine 投资融资招标书", author="Browser Game Engine")
fr_cover = Frame(0, 0, W, H, id="cover")
fr_body = Frame(18 * mm, 20 * mm, W - 36 * mm, H - 40 * mm, id="body")
doc.addPageTemplates([
    PageTemplate(id="Cover", frames=[fr_cover], onPage=cover),
    PageTemplate(id="Body", frames=[fr_body], onPage=later),
])

E = []  # story
E.append(Paragraph("", S_BODY))  # trigger cover
E.append(Paragraph("本页刻意留白 —— 封面信息见整页版式", st("x", textColor=colors.HexColor("#0F2A4A"), fontSize=1)))

def NEXT():
    from reportlab.platypus import NextPageTemplate
    return NextPageTemplate("Body")

# ================= 第一章 =================
E.append(NEXT())
E.append(PageBreak())
E.append(Paragraph("一、项目概述", S_H1))
E.append(Paragraph("1.1 一句话定义", S_H2))
E.append(Paragraph(
    "<b>一个纯浏览器运行的完整 3D 游戏引擎</b>——替代 Three.js 做渲染、替代 Unity 做完整开发闭环"
    "（编辑器 + 运行时 + 导出 + 协作），<b>零后端算力、零运行时依赖、无构建步骤</b>。", S_BODY))
E.append(Paragraph("1.2 关键数据（已交付）", S_H2))
E.append(tbl([
    ["指标", "当前值", "v2 完成时目标"],
    ["引擎模块", "109 个 JS 模块", "约 130 个"],
    ["Smoke 测试", "50 个 / 1596 断言 全绿", "约 65 个 / 约 2500 断言"],
    ["全量测试执行时间", "约 500 ms（Node 22 headless）", "< 2 s"],
    ["游戏 Demo", "4 个（action3d / breakout / match3 / space_shooter）", "5 个（含 action3d v2）"],
    ["渲染后端", "WebGL2 RHI 完整 + Software 黄金参考", "+ WebGPU（WGSL 双轨 + compute）"],
], [55 * mm, 62 * mm, 55 * mm]))
E.append(Paragraph("1.3 项目背景与切入点", S_H2))
E.append(Paragraph(
    "Three.js 是渲染库而非游戏引擎（无物理 / 无音频 / 无编辑器 / 无协作 / 无导出）；Unity、Unreal 依赖后端"
    "服务器与重型打包链路，无法纯浏览器部署；Godot Web 版受 WASM 与 WebGL1 制约性能受限。教育、原型验证、"
    "嵌入式与 H5 游戏场景长期缺少「打开浏览器就能做游戏」的工具。本项目以<b>全部计算 100% 驻留浏览器</b>"
    "（渲染 / 物理 / 烘焙 / 推理 / 序列化）为核心主张，填补浏览器 × 完整引擎这一市场空位。", S_BODY))

# ================= 第二章 =================
E.append(Paragraph("二、市场机会与目标用户", S_H1))
E.append(tbl([
    ["用户群", "痛点", "我们的解"],
    ["独立游戏开发者", "Unity 需要付费 + 打包慢 + 后端依赖", "浏览器打开即用，免费，构建 = 导出目录"],
    ["教育 / 教学", "学生装环境痛苦，Unity 太重", "零安装，浏览器打开写代码跑游戏"],
    ["原型验证", "快速验证游戏机制，不想搭服务器", "浏览器内完成全部计算，无后端"],
    ["嵌入式 / H5 游戏", "WebGL 性能受限，Three.js 功能不够", "自研 WebGL2/WebGPU 引擎，3D 物理完整"],
], [34 * mm, 66 * mm, 72 * mm]))
E.append(Paragraph(
    "本引擎为唯一同时处于「浏览器端 × 完整引擎」象限的产品：Three.js 位于浏览器 × 渲染库，Godot Web 版"
    "性能与体积受限，Unity/Unreal 依赖原生与后端。该空位对应全球数百万量级的 Web 开发者、教育机构与"
    "轻量游戏团队（市场规模测算详见第六章）。", S_BODY))

# ================= 第三章 =================
E.append(Paragraph("三、产品与技术方案", S_H1))
E.append(Paragraph("3.1 已交付功能（引擎运行时 + 编辑器）", S_H2))
E.append(tbl([
    ["子系统", "状态", "说明"],
    ["渲染核心", "✅ 已交付", "WebGL2 RHI（布局 / uniform / 纹理 / FBO / MRT / MSAA / instancing）+ Software 黄金参考"],
    ["PBR 光照", "✅ 已交付", "GGX / PCF 阴影 / IBL / 雾 / 后处理链 / 文字图集"],
    ["物理 3D", "✅ 已交付", "GJK+EPA / Sequential Impulse / 多点接触 / 休眠 / Raycast / 角色控制器"],
    ["内容管线", "✅ 已交付", "GLTF 2.0（.glb）/ 骨骼动画+mixer / 图片解码 / DDC / 纹理桥"],
    ["平台层", "✅ 已交付", "OPFS 持久化 / FSA / Worker 池（协议层）/ 资源缓存"],
    ["推理", "✅ 已交付", "神经网络推理模块（TF.js 可选，缺失降级内置 NanoTensor）"],
    ["编辑器", "✅ 已交付", "GPU 视口 / 层级与检视器 / 代码工作台 / Play 模式 / Profiler / Debug"],
], [30 * mm, 22 * mm, 120 * mm], align_center_cols=(1,)))
E.append(Paragraph("3.2 非功能需求", S_H2))
E.append(tbl([
    ["维度", "要求"],
    ["性能", "WebGL2 1080p 中端 GPU ≥ 30 fps；Software 160p parity 通过"],
    ["依赖", "零运行时依赖 / 无 npm install / 无构建步骤 / 纯 ES2022"],
    ["确定性", "跨运行可重现（Rng 种子 / 序列化 byte-identical / 固定 key 序）"],
    ["计算驻留", "渲染 / 物理 / 烘焙 / 推理 / 序列化 100% 浏览器端；companion 仅文件 IO"],
    ["可测试", "全量 smoke Node headless；CPU 黄金参考永不下线；parity 断言"],
    ["降级", "WebGPU 不可用时回退 WebGL2；Worker 不可用时顺序降级"],
], [26 * mm, 146 * mm]))
E.append(Paragraph("3.3 关键设计原则（技术护城河）", S_H2))
for t in [
    "<b>① CPU 黄金参考永不下线：</b>Software 光栅器作为 parity 基准，GPU 实现必须逐像素对齐（≤ 2/255），数值正确性可验证；",
    "<b>② 确定性可重现：</b>固定 key 序 / LF / 无时间戳 / 稳定 ID / 种子 Rng，跨运行跨平台可验证；",
    "<b>③ 单后端自包含：</b>非微服务，引擎 + 编辑器 + 运行时同进程，减少 IPC 开销；",
    "<b>④ 编辑器 → 运行时单向依赖：</b>运行时跑在场景深拷贝快照上，停止即回滚，编辑态零污染；",
    "<b>⑤ 诚实降级：</b>caps 翻真前行为保持 false，无能力时显式降级而非静默崩溃。",
]:
    E.append(Paragraph(t, S_BODY))

# ================= 第四章 =================
E.append(Paragraph("四、交付成果与质量体系", S_H1))
E.append(Paragraph("4.1 质量保障机制", S_H2))
for t in [
    "每个模块必须配套 smoke 测试（新增功能强制配套）。",
    "Parity 断言：WebGL2 vs Software 逐像素对比，容差 ≤ 2/255。",
    "确定性断言：跨运行可重现（Rng 种子 / 序列化 byte-identical）。",
    "全量测试 Node headless、无外部依赖，约 500ms 执行完毕，可进 CI。",
]:
    E.append(Paragraph("• " + t, S_BODY))
E.append(Paragraph("4.2 覆盖域（50 smoke / 1596 断言）", S_H2))
E.append(tbl([
    ["类别", "Smoke 数", "代表性测试"],
    ["Core（数学 / Rng / JSON / Profiler）", "2", "core_smoke (31) / profiler_timeline (12)"],
    ["Render（RHI / PBR / Shadow / PostFX）", "14", "render_primitives (908) / render_ibl (33)"],
    ["Sim（物理 / 角色 / 粒子）", "5", "sim_physics3d (21) / sim_character (9)"],
    ["Platform（GLTF / Image / Worker / Cache）", "6", "plat_worker (35) / plat_skin (22)"],
    ["Editor（视口 / 代码 / Profiler / Debug）", "7", "editor_smoke (32) / editor_code_editor (21)"],
    ["Game / Play（脚本 / 会话 / 推理）", "4", "play_session (10) / infer (15)"],
], [72 * mm, 22 * mm, 78 * mm], align_center_cols=(1,)))

# ================= 第五章 =================
E.append(Paragraph("五、v2 路线图与里程碑", S_H1))
E.append(tbl([
    ["阶段", "内容", "规模", "状态"],
    ["Q1", "物理 3D 真实化（GJK+EPA / 角色控制器）", "约 1400 行", "✅ 80%"],
    ["Q2", "音频输出 + 网络传输", "约 600 行", "待启动"],
    ["Q3", "TAA / Hi-Z GPU 接线", "约 600 行", "待启动"],
    ["Q4", "WebGPU 真实化（WGSL 双轨 + compute×3）", "约 1000 行", "待启动"],
    ["Q5", "Worker 池化（GLTF/纹理/DDC 迁入 Worker）", "约 350 行", "✅ 40%"],
    ["Q6", "多人协作（companion.mjs + presence + 对象锁 + CI）", "约 900 行", "待启动"],
    ["Q7", "静态导出 + 验收游戏（action3d v2 完整游戏）", "约 300 行 + demo", "待启动"],
], [18 * mm, 92 * mm, 42 * mm, 20 * mm], align_center_cols=(0, 2, 3)))
E.append(Paragraph(
    "近期计划（1-2 周）：Q5 补全 GLTF/纹理/DDC 迁入 Worker、Q1 runtime 接线真世界步进；中期（2-4 周）："
    "Q2 音频桥 + 网络传输、Q3 TAA/Hi-Z；远期（4-8 周）：Q4 WebGPU compute、Q6 多人协作、Q7 静态导出与验收游戏。", S_BODY))

# ================= 第六章 =================
E.append(Paragraph("六、商业模式与市场前景（规划）", S_H1))
E.append(Paragraph("以下商务模式为<b>拟定规划</b>，供投资评审参考；正式条款以投资协议为准。", S_NOTE))
E.append(tbl([
    ["模式", "对象", "内容"],
    ["开源核心（Apache-2.0）", "全体开发者", "引擎与编辑器核心开源，构建生态与标准"],
    ["教育版 / 院校授权", "高校 / 培训机构", "教学课程包、实验环境、批量授权与技术支持"],
    ["商业增值服务", "工作室 / 企业", "优先技术支持、定制内容管线、私有化部署与协作服务"],
    ["生态分成（远期）", "游戏发行渠道", "静态导出的即点即玩小游戏分发与运营分成"],
], [40 * mm, 38 * mm, 94 * mm]))
E.append(Paragraph(
    "市场空间：全球 Web 开发者与轻量游戏开发团队规模持续增长；教育信息化与院校游戏开发课程普及带来稳定"
    "的 B 端预算；嵌入式 / H5 出海游戏对「无安装、秒开」形态需求明确。零依赖纯 ES2022 的形态天然适配"
    "内网、信创与低配终端环境，形成差异化壁垒。", S_BODY))

# ================= 第七章 =================
E.append(Paragraph("七、融资需求与资金用途（拟定）", S_H1))
E.append(Paragraph("以下金额与比例均为<b>拟定方案</b>，供投资评审参考；最终以投资协议约定为准。", S_NOTE))
E.append(tbl([
    ["项目", "内容"],
    ["拟融资额度", "人民币 1,000 万元（可分两期：一期 400 万到位后 6 个月内完成 v2 Q2-Q7；二期 600 万用于商业化）"],
    ["出让安排", "拟出让 10%–15% 股权（视估值与尽调结果协商）"],
    ["研发投入", "40% —— v2 Q2-Q7 核心研发（音频/网络/TAA/WebGPU/协作/导出）"],
    ["团队扩充", "25% —— 引擎研发 2 人、DX/图形 1 人、开发者关系 1 人"],
    ["市场与生态", "20% —— 教育渠道共建、开发者社区运营、Demo 赛事"],
    ["运营与合规", "15% —— 法务 / 知识产权 / 基础设施 / 日常运营"],
], [32 * mm, 140 * mm]))
E.append(Paragraph(
    "资金里程碑对价：一期资金对应交付物 = v2 全量路线图完成 + 65 smoke / 2500 断言全绿 + action3d v2 验收"
    "游戏 + 静态导出闭环；二期资金对应商业化收入验证（教育授权 ≥ 10 家或商业服务合同 ≥ 3 单）。", S_BODY))

# ================= 第八章 =================
E.append(Paragraph("八、招标范围与投标人资格", S_H1))
E.append(Paragraph("8.1 招标标的", S_H2))
E.append(Paragraph(
    "本项目对 v2 剩余六个季度目标（Q2–Q7）的开发与验收工作进行公开招标，投标人可投单个或多个工作包，"
    "鼓励整体总承包。各工作包验收均以「配套 smoke 全绿 + parity 断言通过 + 确定性断言通过」为硬性标准。", S_BODY))
E.append(tbl([
    ["工作包", "内容", "规模", "验收要点"],
    ["WB-Q2", "音频输出（WebAudio 桥 / 合成器 / 3D Panner / 文件解码）+ 网络传输（WebSocket + 快照插值 + 预测回滚）", "约 600 行", "音频/网络 smoke 全绿；断线重连与插值回放正确"],
    ["WB-Q3", "TAA（运动矢量 + Halton jitter）+ Hi-Z GPU 归约 + 遮挡剔除", "约 600 行", "与 Software 参考逐像素对齐 ≤ 2/255"],
    ["WB-Q4", "WebGPU 真实化（WGSL 双轨 + compute×3：Hi-Z / DDGI / ReSTIR）", "约 1000 行", "WebGL2 回退路径行为一致；caps 诚实降级"],
    ["WB-Q5", "资产管线接入 Worker（GLTF / 纹理 / DDC 迁入 Worker）", "约 200 行", "50MB GLB 导入主线程帧时间 < 16ms"],
    ["WB-Q6", "多人协作（companion.mjs + presence + 对象锁 + CI）", "约 900 行", "并发编辑冲突消解正确；CI 全绿"],
    ["WB-Q7", "静态导出 + 验收游戏（单目录导出 + action3d v2 完整游戏）", "约 300 行 + demo", "导出目录零依赖可玩；game smoke 全绿"],
], [18 * mm, 74 * mm, 24 * mm, 56 * mm], align_center_cols=(0, 2)))
E.append(Paragraph("8.2 投标人资格要求", S_H2))
for t in [
    "具备 JavaScript / TypeScript 与 WebGL2 图形编程的成熟经验，熟悉渲染管线与 RHI 抽象；",
    "熟悉物理求解（GJK / EPA / Sequential Impulse）或 WebGPU compute 者优先（对应工作包）；",
    "接受本项目的工程红线：零运行时依赖、纯 ES2022、CPU 黄金参考先行、诚实降级、确定性可重现；",
    "所有新增功能必须配套 smoke 测试，并保证全量 1596+ 断言不回归；",
    "投标人须提交技术方案书、工期计划、报价与近三年同类项目案例。",
]:
    E.append(Paragraph("• " + t, S_BODY))

# ================= 第九章 =================
E.append(Paragraph("九、评标办法与合同要点", S_H1))
E.append(Paragraph("9.1 评标权重（综合评分法）", S_H2))
E.append(tbl([
    ["评分项", "权重", "评分要点"],
    ["技术方案", "40%", "架构契合度、parity/确定性保障方案、降级策略完整性"],
    ["团队与案例", "25%", "同类引擎 / 图形项目经验、核心成员稳定性"],
    ["报价", "20%", "总价合理性、按工作包报价颗粒度"],
    ["工期与质量保障", "15%", "里程碑可行性、测试与 CI 保障、售后支持"],
], [36 * mm, 22 * mm, 114 * mm], align_center_cols=(1,)))
E.append(Paragraph("9.2 合同要点（要点摘要，以正式合同文本为准）", S_H2))
for t in [
    "<b>付款节点：</b>按工作包里程碑分期支付（签约 20% / 中期验收 40% / 终验 40%）；",
    "<b>知识产权：</b>工作成果知识产权归招标人所有，投标人保留简历展示权；",
    "<b>验收标准：</b>配套 smoke 全绿 + 全量断言无回归 + parity ≤ 2/255 + 确定性断言通过；",
    "<b>违约与退出：</b>里程碑延期超过 4 周或两次验收不通过，招标人有权终止并追偿。",
]:
    E.append(Paragraph(t, S_BODY))

# ================= 第十章 =================
E.append(Paragraph("十、风险与应对", S_H1))
E.append(tbl([
    ["风险", "影响", "应对"],
    ["WebGPU 浏览器兼容性", "用户无法使用 compute", "诚实降级到 WebGL2；caps 翻真前保持 false"],
    ["物理数值稳定性", "堆叠爆炸 / 穿透", "多点接触 + Baumgarte 校正 + 休眠双阈值 + 恢复阈值"],
    ["Worker 浏览器限制", "Node 端不可用", "顺序降级保持异步语义，同一套代码"],
    ["性能不达标", "游戏卡顿", "Software parity 基准 + 分阶段优化 + profiler 实测"],
    ["范围蔓延", "无法交付", "非目标明确排除（第三方库 / 服务端 / AAA / WebXR）"],
], [40 * mm, 44 * mm, 88 * mm]))

# ================= 第十一章 =================
E.append(Paragraph("十一、联系方式与声明", S_H1))
E.append(tbl([
    ["事项", "方式"],
    ["招标 / 融资咨询", "project@example.com（示例占位，正式发布前替换）"],
    ["投标文件递交", "电子版发送至上述邮箱，密封报价单随技术方案书一并递交"],
    ["答疑与澄清", "收到本文件后 7 个工作日内书面提出"],
], [40 * mm, 132 * mm]))
E.append(Paragraph(
    "声明：本文件基于《Browser Game Engine — PRD 一页纸》v2 编制，用于投资融资与开发招标评审。文中标注"
    "「拟定」「规划」的商务条款为编制方建议方案，不构成法律要约；技术数据（模块数 / smoke / 断言 / 基准）"
    "均来自仓库实测。未经许可不得对外传播。", S_NOTE))

doc.build(E)
print("PDF_DONE")
