# 研究与方法

## 和弦识别

Tonal 字典提供和弦类型与音程结构。引擎对实际音级去重后匹配字典，保留实际八度与最低音。完整匹配优先，候选排序是命名启发式，不是统计置信度。

省略音推测要求至少三个实际音级，保留三音与七音，只允许省略纯五音。桌面版不自动累积已释放的旋律音，不读取音频。分解和弦可借助踏板或虚拟保持选音分析。

MIDI 不携带原始等音拼写信息，显示拼写根据候选角色推导。例如减七音可写作 B♭♭，变化九音可写作 D♯。音高采用十二平均律，MIDI 60=C4；A4 默认 440 Hz，可调整频率显示与合成试听参考。

桌面版对密集输入使用 65 ms 聚合窗口，最长 200 ms 强制更新；空音集立即清除。不改变音符、力度或踏板状态的消息不触发重复分析与界面重绘。

## 情绪与限制

大小性质、悦耳程度与张力不是同一概念。标签是定性听感提示，没有将下列研究解释为对每一种延伸和弦的严格验证。文化经验、调性语境、音区、排列与音色均可能改变感受。练习判定直接比较音高，不使用情绪或候选名称。

## 资料

1. Harte, Sandler, Abdallah & Gómez (2005). *Symbolic Representation of Musical Chords: A Proposed Syntax for Text Annotations.* ISMIR, 66–71. https://ismir2005.ismir.net/proceedings/1080.pdf
2. Lahdelma & Eerola (2016). *Single chords convey distinct emotional qualities to both naïve and expert listeners.* Psychology of Music, 44(1), 37–54. https://doi.org/10.1177/0305735614552006
3. Lahdelma & Eerola (2016). *Mild Dissonance Preferred Over Consonance in Single Chord Perception.* i-Perception, 7(3), 1–21. https://doi.org/10.1177/2041669516655812
4. McDermott, Schultz, Undurraga & Godoy (2016). *Indifference to dissonance in native Amazonians reveals cultural variation in music perception.* Nature, 535, 547–550. https://doi.org/10.1038/nature18635
5. W3C. *Web MIDI API.* https://www.w3.org/TR/webmidi/
6. MIDI Association. *MIDI 1.0 Control Change Messages.* https://midi.org/midi-1-0-control-change-messages
7. Tonal. *Chords.* https://tonaljs.github.io/tonal/docs/groups/chords
