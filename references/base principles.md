1. To resist intention decay—the degradation of core goals as instructions ripple through a distributed network—you must optimize for information density, algorithmic validation, and stigmergic coordination.Maximizing instruction efficiency and preventing intent drift requires specific, actionable protocols:1. Vectorize and Ground Instructions (Information Density)High-Dimensional Embeddings: Transmit core intent as compressed vector representations instead of verbose natural language, ensuring geometric alignment across nodes to prevent feature overlap and data collapse.Bounded Context Windows: Limit turn-level memory to only what is strictly necessary. Too much historical context allows nodes to drift from the original goal.Continuous Injection: Instead of retrieval-based querying, passively inject structured intent directly into individual node buffers.2. Algorithmic Validation (Zero-Drift Execution)Chain-of-Thought Guardrails: Require individual nodes to evaluate the intent internally using structured CoT processes, verifying that the proposed action directly serves the meta-goal.Write-Time Invalidation: Constrain the hive system to discard or overwrite obsolete commands. This prevents nodes from operating on stale, pre-drift interpretations of the original instructions.State-Trajectory Normalization: Assign dense, environment-grounded rewards so that nodes measure their success based on immediate state transitions rather than ambiguous, long-term goals.3. Stigmergic Coordination (Indirect Intent Enforcement)Environment over Direct Communication: Have the "hive" dictate the environment (e.g., boundaries, resources, and persistent markers) rather than attempting to direct the individual nodes turn-by-turn.Redundant Role Specialization: Pre-define fault-tolerant roles across the network. If a node decays or fails, a backup node with identical baseline instructions can dynamically reassign itself without needing new directives.

2. DeepMind video: deep Mind's new AI just did something amazing or did it you see there was a legendary mathematician called Paul Adush fellow Hungarian who left more than a thousand open problems to the world to solve look we Hungarians have a lot of problems we got to contribute somehow and this is our way of doing it now DeepMind's new AI called Alpha Proof Nexus tried to solve about 350 of them and came up with a 95.7% failure rate basically it solved nine and it only cost a couple hundred per problem is that good well I got to say that is incredibly super good why well these are decades old problems that were not solved by anyone yet the other line of criticism I hear is that this did not do fundamentally new things is that a problem i think not why well let's look back to 4 years ago gpt3 people said "Well it can't even add numbers together reliably." Then two years ago people said "Well it can't even solve high school competition problems reliably." Then one year ago people said it can't even win the mathematical Olympiad gold medal reliably and today they are saying well it can't even solve 50-year-old unsolved problems reliably do you see where this is going it is clear as day please apply the first law of papers here it says do not look at where we are look at where we will be two more papers down the line and this result is absolutely amazing stunning even so how did they do it how is that even possible dear fellow scholars this is two minute papers with Dr ko Jaer normally you would reach out to some AI assistant to take a crack at it but it won't solve it because they hallucinate and make things up to avoid that they make it use lean a formalized mathematical language where it's easy to check whether your proofs are correct is this new not at all everyone is doing that today okay so what's new here look first a mathematician writes down the problem in lean and the solution the proof is left blank then the AI agent tries to solve it of course it fails too hard then another AI checks it and says "This is not great." But it also says why it's not great but here's the key this guy right here this is a cheaper judge AI that reads two previous solutions and picks a winner both solutions can be wrong but it picks the one that is a bit better now this is genius why well hold on to your papers fellow scholars because it's kind of like a chess system where the solutions are the players and each of these players gets an ELO score also named after Arpad Ilu fellow Hungarian look sometimes we provide solutions too so each proof now has a score and now we start again but not from scratch no no no we start out from the highest scoring bad solution so this is now a tournament do this over and over again so cool and now we keep running and running this tournament until the validator says "Yep this one checks out." And then we have a formal proof nailed it this is incredible because it takes an unreliable AI runs it over and over again and it can lie its rear end off as much as it wants and we still get a reliable system out of this a reliable system built out of unreliable parts i love that and the fact that they put all this research out there in the open for free for all of us chef's kiss thank you so much for everyone who worked on this what a time to be alive but wait interestingly the story of AI so far has been that we make it smarter now the story has changed we don't need to make it smarter we need to make the harness around it tighter give it a good judge let it fail a thousand times and it will slowly work out the right solution to incredibly hard problems so here the intelligence is not just in the model but it is in the loop around it everyone is experimenting with different kinds of loops and it is super fun i do it to a lambda okay not even this technique is perfect limitations in other words the stuff that you don't hear about in mainstream media so one why not test on the full 1,200 adouch problems well there is a little selection bias here i think they took a subset of 350 that was easier to formalize is that a problem in my eyes not at all you got to start somewhere let's not be one of those people that say "Well it can't even solve the 50-year-old unsolved problems reliably." What it has achieved is incredible now two smaller models solved zero problems zero nothing you still need a beefy AI system at the core that is an interesting case because people keep showing these benchmarks where the super fast cheap model is just a couple percentage points away from the frontier and whenever I try them they always seem a great deal weaker this seems to reinforce that also people will probably start thinking "Do I use a larger model with fewer tournament rounds or do I use a smaller one with more?" Assume that they cost the same interesting question now where does this put us well an AI just solved nine math problems that no human could crack in 56 years for a couple of hundred each and they did it by letting an unreliable AI fail thousands of times against a judge that cannot lie and we went from can't even add numbers to solving decades old open problems in the span of 4 years and I think that is insane but limitations apply also models used to be the only thing that matters now harnesses loops around them also matter now I recently talked to Pushmmit one of the leaders of the project and he is amazing i am just a student who loves to travel the world and tries to learn from incredible scientists like him and bring that knowledge to you fellow scholars and it is a huge honor for me to be able to talk about it to such a super smart audience as you fellow scholars subscribe and hit the bell if you feel that this is the way of doing it thank you so much for being with me all these years and over more than a thousand videos we need new tools for the era of LLMs and Weights and Biases now has weave a lightweight toolkit to confidently iterate on LLM applications use traces to debug how data flows through each step of your app and use evaluations to measure your progress it is the best try it out now at wnb.me/papers me/papers or click the link in the description below.

3.Fractal Views: 
A Fractal-Based Method for
Controlling Information Display
HIDEKI KOIKE
University of Electro-Communications
Computer users often must view large amounts of information through video displays which are
physically limited in size. Although some methods, which automatically display/erase information
units based on their degrees of importance, have been proposed, they lack an ability to keep the
total amount of displayed information nearly constant, We propose a new method for information
display based on fractal theory. By regarding the information structures used in computers as
complex objects, we can abstract these objects as well as control their amount. Using our method,
(1) the total amount of information is kept nearly constant even when users change their focuses
of attention and (2) this amount can be set flexibly. Through mathematical analysis, we show our
method’s ability to control the amount. An application to program display is also shown. When
this method is applied to the display of structured programs, it provides fisheye-like views which
integrate local details around the focal point and major landmarks further away.
Categories and Subject Descriptors: D.2.3 [Software Engineering]: Coding—pretty printers;
H.1,2 [Models and Principles]: User/Machine Systems—human factors; human information
processin~ H,5.2 [Information Interfaces and Presentation]: User Interfaces—screen de-
sign; theory and methods; 1,3 [Computer Graphics]: Methodology and Techniques; 1,7.2 [Text
Processing]: Document Preparation—format and notatzon; hypertezt/hypermedia
General Terms: Algorithms
Additional Key Words and Phrases: Abstracting methods, fractals, information visualization,
program display, UI theory
1. INTRODUCTION
As computer systems evolve, the capability of restoring and managing information
increases more and more. At the same time, computer users must view increasing
amounts of information through video displays which are physically limited in size.
Displaying information effectively is a main concern in many software applica-
tions. For example, in visual programming systems [Shu 1988], graphic representa-
tions become very complex if the number of visual elements increases. In hypertext
1The word “information” is used as a structured set of primitive elements which is specific to each
application.
Author’s address: 481 Minor Hall, School of Optometry, Unlverslty of Califorma, Berkeley, CA
94720-2020; email: koike@milo.berkeley. edu; (permanent address: Graduate School of Information
Systems, University of Electro-Communications, 1–5–l, Chofugaoka, Chofu, Tokyo 182, Japan;
email: koike~cas.uec.ac. jp).
Permission to make digital/hard copy of part or all of this work for personal or classroom use is
granted without fee provided that copies are not made or distributed for profit or commercial
advantage, the copyright notice, the title of the publication, and its date appear, and notice is
given that copying is by permission of ACM, Inc. To copy otherwise, to republish, to post on
servers, or to redistribute to lists, requires prior specific permission and/or a fee.
01995 ACM 1046-8188/95/0700-0305 $03.50
ACM Transactions on Information Systems, Vol. 13, No. 3, July 1995. Pages 305-323.
https://lh3.googleusercontent.com/notebooklm/AKXwDQEFyd-dt9vvrRuFvrln2_oh4xurGxHqmcf23VPuxE-fyeFd6QIR-sQVNTcYQQn0SoNAuAN6uLKeEvtIbE0LxPLMQGWfLHLQametloTtAIRLFifCLq9I7c1A4D3Y1Xn8yPjuSU_tpQ=w992-h1280-v0
306 . Hidekl Kolke
systems [Halasz et al. 1987], information is scattered between layers of opened
windows which can bog the display. In virtual reality systems, the response of the
system becomes very slow if many graphic elements are defined to obtain a real-
istic image. We face similar problems in other applications, such as the display
of large lmowledge bases [Fairchild et al. 1988], or the display of program source
code [Furnas 1986].
In order to solve this so-called small-screen problem [Card and Henderson 1987],
x number of techniques have been proposed, which can be roughly divided into
two categories: (1) large-workspace approaches and (2) information reduction ap-
proaches.
Large- Workspace Approaches. Instead of using normal displays, these approaches
use real or virtual large screens to display information. Dataland [Bolt 1984] uses
a video projector to display various information on the wall. Rooms [Card and
Henderson 1987] displays only the minimum information necessary to complete a
certain task on the basis of analysis associated with the user’s task switching.
In virtual reality systems [Feiner and Beshers 1990; Fisher et al. 1986; Fo-
ley 1987], users can display various information by using head-mounted displays.
Other works exist which use 3D computer graphics for information display with-
out the use of head-mounted displays. Information Visualizer [Card et al. 1991;
Mackinlay et al. 1991; Robertson et al. 1991], for example, demonstrate es an ef-
fective use of screen space through linear and hierarchical structures in 3D space.
VOGUE [Koike 1992; 1993a] focuses on multiple aspects of software information
and displays them effectively in 3D. These methods partially solve the display space
problem. If the amount of displayed information, however, increases continually,
they will again face the same information-overloading problems as normal displays.
Also, the recognition time increases monotonically with respect to the number of
objects. Therefore, if the amount of displayed objects becomes larger, the task to
identify an object becomes increasingly more difficult.
Information Reduction Approaches. On a different perspective, there exist some
theoretical methods which can reduce the amount of information by focusing on
the syntactic structure of the information. This simple and classic technique is
the met hod used in Lisp printers (for example, see Steele [1990]). However, its
drawback is that users must manually change each variable corresponding to their
interests. A more elegant method is used in Furnas’ [1986] generalized fisheye views.
Using a priori importance of the hierarchical structure and logical distance from
the focal point, generalized fisheye views made it possible to satisfy the following requirement.
Requirement 1.1. Details near a focal point and only important landmarks fw--
ther away should be displayed.
For example, a normal screen editor displays a line currently focused on along with
some consecutive lines before and aft er it. With fisheye views, users can see not
only details around an editing line but also important lines such as while, for, or if
statements. Furnas also conducted some user studies, and reported that these kinds
of views which integrated details and contexts were useful in certain applications.
ACM Transactions on Information Systems, Vol 13, NO 3. JUIY 1995
https://lh3.googleusercontent.com/notebooklm/AKXwDQH6ARAxInlW8KB8YTv1HaIZHhMu_haeT9OtriCzmFG9ifU5aZXOrWUlvxk1Oq1LniP5hIxmAwO7Vt9w-yZsNiLzT2KDKIl2_LHQUju6sGWGZAKCOMMW9K5Lo_zj0zZJDmtYJp7OMA=w992-h1280-v0
Fractal Vrews: A Fractal-Based Method for Controlling Information Display . 307
We agree that the aforementioned types of views can be helpful for users. From
the cognitive viewpoint, however, it is not sufficient. The common problem in these
previous methods, as we shall later describe in further detail, is the lack of ability
to control the amount of information displayed when users change their focuses of
attention. When users edit programs, the focused line changes continually. We
believe that it is undesirable that the number of displayed lines changes drastically
when users change their focal point. Thus, we must add another requirement for
information display, and that is:
Requirement 1.2. The total amount of displayed information should be kept nearly
constant regardless of whether users change their focus of interest.
This requirement is needed for physical space problems as well as for human cogni-
tion problems which we described earlier. Also, we recognize an addendum to the
previous requirement as follows:
Requirement 1.3. This amount should be set flexibly.
The moderate amount to be displayed is different for each user. For the same user,
this amount may change daily corresponding to the user’s condition. Thus, the
amount should be readily set.
This article describes a new method of information display, labeled jractal views,
which is an application of fractal theory to information structures and which can
satisfy these three requirements simultaneously. Alt bough fract al views and Furnas’
fisheye views are similar in nature, fractal views focus on solving a sibling overload
problem which was not addressed in Furnas [1986]. By solving the sibling overload
problem, the entire view size can be controlled.
In the following sections, the basic concept of fractal views will be described,
as well as an extension from physical regular trees to logical general trees. Next,
through an application example of our method to program displays, we will attempt
to show how the necessary requirements for information display are satisfied. Fi-
nally, we will discuss the differences between fisheye views and our method, and
discuss limitations of our method.
2. BASIC CONCEPT OF FRACTAL VIEWS
The fractal [Mandelbrot 1982] is an important concept because it makes it possible
to discuss the complexity of an entity not only in quantitative terms, but in math-
ematical terms as well. In engineering fields, fractals are mostly associated with
applications in image synthesis [Barnsley et al. 1988; Peitgen et al. 1992] or image
processing [Kaneko 1987].
Figure 1 represents triadic Koch curves which are frequently referenced as exam-
ples of fractal figures. Strictly speaking, these figures are just approximations called
prefractak [Feder 1988] because real fractal figures are obtained in the infinite state.
In other words, we must make infinite recursive calls to draw true fractal figures.
This approximation mechanism is an abstraction of the complex object with a certain scale which is set by an observer. If a large scale is adopted, the degree
of abstraction becomes high (see the upper figure in Figure 1). If a small scale
is adopted, the degree of abstraction becomes low (see the lower figure in Figure
ACM Transactions on Information Systems, Vol. 13, No. 3, July 1995.
https://lh3.googleusercontent.com/notebooklm/AKXwDQFgwMwGAUKZkp8B5u4iwCHN4ThcQ-tG7U-1cEB1R477vM7QKJgCpQIq3ehFTwjswCR3-xrqJlanLfF4E297q-qFf_oi3Xqrw0Xhczt9YaYeoTKHgrKiIaXW4NAt3Nw5bl70yQaCSA=w992-h1280-v0
308 . Hideki Koike
abstraction level
high
low
Fig. 1. Generations of triadic Koch curve. By changing the scale, Its abstraction level also changes.
1). This approximation, by changing the scale, can also be seen when we process
digital images and so on. We call this approximation mechanism fractal wews.
The information structures used in computers, such as the directory structure of
UNIX,2 are generally represented as trees or networks. If we regard these logical
structures as complex objects, and introduce a certain concept of scale, we can
control the degree of abstraction as well as abstract these information structures.
In this article, we limit our consideration to trees and formalize fractal views for
information structures.
3. EXTENSION OF FRACTAL DIMENSIONS
We want logical trees to be viewable in controllable detail, analogous to differ-
ent levels of prefractal display, and we need to do this regardless of heterogeneous
branching. Figure 2 illustrates the fractal views for physical regular trees and those
for logical general trees. In physical fractal trees, where each edge length is cal-
culated by a fractal function described later, the tree can be observed in further
detail by reducing the scale. In logical trees, after calculating the importance of
each node using the fractal function, the size of the entire view can be controlled by
changing the scale (threshold). This presupposes a fractal dimension for the trees.
However, the fractal dimension described in Mandelbrot [1982] is for trees repre-
sented as figures, and not for logical trees. Thus, we extend the fractal dimensions
ZUNIX is a trademark of AT&T Bell Laboratories.
ACM Transactions on Information Systems, Vol 13, No. 3, July 1995
https://lh3.googleusercontent.com/notebooklm/AKXwDQH1VKG16oE4kyQZ2SlibRnvBgEM_a2p1piJslTQhrgCKm22xctB4gpEhuGR9fzVG_xgOsWaRYYRw17fBNKluTM88_jnSe0kxixxhljMvtbkymmNz4X3QT02KCO6R9fogoFkzWXs=w992-h1280-v0
Fractal Views: A Fractal-Based Method for Controlling Information Display . 309
Fractal views fo r physical regular trees
Fractal views for logical general trees
F-”
V*7Y -Y “v
Fig. 2. Fractal views for physical regular trees and those for logical general trees. In physical trees,
each edge length is controlled by a fractal function. In logical trees, the degree of importance of
each node, which is represented by the radius of the node in this figure, is controlled by the fractal
function. In both cases, by changing the scale, the different levels of abstracted views are obtained.
in the following manner:
(1) the similarity dimension for physical regular trees is briefly described;
(2) a log-log plot analysis is introduced in order to treat general trees;
(3) the condition that the general tree is said to be a fractal is shown, using the
log-log plot analysis;
(4) this analysis is extended to logical trees.
3.1 Similarity Dimension for Regular Trees
Figure 3 is a fractal binary tree drawn with a recursive algorithm. If the length
of any branch is r times longer than that of the previous branch, the similarity
dimension of this tree can be calculated to be:
D = – logr 2.
In the same way, the similarity dimension of a tree which has N children at each
node (we call it an N-branch tree) can be calculated to be:
D = – logT N.
3.2 Fractal Dimension by a Log-Log Plot
There are few objects in nature which are strictly self-similar. Mandelbrot proposed
a more loose definition of the fractal as follows [Feder 1988, p. 1 I],
A fractal is a shape made of parts similar to the whole in some way.
ACM Transactions on Information Systems, Vol. 13, No. 3, July 1995.
https://lh3.googleusercontent.com/notebooklm/AKXwDQELRMIj6F9QjH8lS5fKKwLPGP2jfcD7S_yAIytab_eCjhUN_8jcgSzXHew8S4WAgeMxz0OYNh9E17Nz-HaInE4lU87th6BOzgftQSzUJoywAB6_0jEG01ML8n7cv48jovF51mxu=w992-h1280-v0
310 . Hideki Kolke
Fig. 3. A fractal binary tree. If the length of each branch is r times longer than that of the
prewous branch, its fractal dimension is defined as – logr 2.
The figure of a coastline is one such example. To examine whether an object is a
fractal or not, log-log plots are often used. In these plots, the x-axis indicates log 6,
where 6 is the scale, and the y-axis indicates log Lc(ti), where Lc(c$) is the length
of the coast calculated with respect to 6. If the object is a fract al, the plot forms
a line with negative slope, and the fractal dimension is calculated from that slope.
Roughly speaking, it is the essence of a fractal object that a log-log plot of the size
of the measurement unit versus the size of the object measured in such units forms
a straight line with negative slope.
In Figure 3, if the length of the first branch is 1, the length 6 of each branch
under the nodes at depth n is
6=rn.
Thus, the total length L of all branches at this depth n is
L = d X 2“ = (2r)’.
If we eliminate n from the two expressions, by solving for L in terms of 6 and r, we
obtain
L = (2r)’
= exp{ln(2r)n}
1nd(ln2+ln r)}= exp{=
= exp{lnti(log, 2 + 1)} — ~1-D
where D = – log, 2. Therefore, the total number of branches at this depth, 2“(6),
is
T(6) = L/d = 6-D.
If t his relation is log-log plotted, the plotline is straight, and its slope is –D. That
is, the total number of branches at a certain depth is a fractal, and its fractal
ACM Transactions on Information Systems, Vol 13, No. 3, July 1995,
https://lh3.googleusercontent.com/notebooklm/AKXwDQFunYfjGjj0X6SH-o7_AOyQmySzhTI2WdsNQNF4fYerpjuWDKXeBiC2_w7uMp7YBUU7Hsnus3cx98al07nxW_QR00V3fyytxGM3-z8v9GAMIsTob8pstZ_T4SDlieD6huTWnZ-DeQ=w992-h1280-v0
Fractal Views: A Fractal-Based Method for Controlling Information Display . 311
In T(d)
I
\
trinary tree
......+ ..... binary tree
....... ....
....
-
Fig. 4. Log-log plot of the grafted tree
dimension is D = – logr N. This value is the same aa the similarity dimension we
calculated previously.
3.3 Fractal Character of General Trees
Consider the grafted tree, which starts out as a fractal binary tree with a scale
factor r2, and changes into a fractal trinary tree with a scale factor r3 at every
node of a certain depth. The log-log plot of this grafted tree would be as shown in
Figure 4.
The plotline for the binary tree coincides with the plotline for the trinary tree
at a certain point. The condition that two plotlines form a continuous line is that
their slopes are equal. That is,
logT22 = log,33.
To generalize the above concept, if the relation
log.= Nz = Constant (1)
exists between the number of branches N= and a scale factor r., at each node of a
tree, the log-log plot forms a single line. Therefore, the tree satisfying expression
(1) is said to be a fractal.
3.4 Extension to Logical Trees
The fractal dimension for an N-branch tree is calculated by focusing on the length of
the branch. In the case of logical trees used in computers, however, it is impossible
to calculate their fractal dimension because their branches are not composed of
lengths. This problem can be solved by associating a conceptual value with each
node. A conceptual value is given to each node, which we will call “the fract al value”
for convenience, and this value changes by a scale factor. Figure 5 represents the
fract al values of a logical trinary tree with scale factor r.
With this conceptual extension, we can define the fractal dimension for the logical N branch tree whose fractal values are controlled by the scale factor r as
D = – log. N.
ACM Transactions on Information Systems, Vol. 13, No. 3, July 1995.
https://lh3.googleusercontent.com/notebooklm/AKXwDQGE327C0tWnzCFjrWFwj99eHRXERu9rhIILOV8YwkfzpBImnLWrn5guyH_TYA6_wKkSPoqPIAVgBP82lPgDFe5gjkKc_uIAvWpW8D-G5iPG75k5z7HIcDsn7uYKtyuItvp2aSATBw=w998-h1280-v0
312 . Hideki Koike
Fig. 5. A logical trinary tree and its fractal values. The fractal value of a node is r times that of
its parent.
This definition can be extended to a logical general tree by using the same method
described in Section 3.3.
To summarize, a logical general tree is said to be a fractal if there exists a relation
logrz N. = Constant,
between the number of branches N. and the scale factor rz, at each node.
4, FORMALIZING FRACTAL VIEWS
In this section, we will formalize the definition of fractal views which associates a
fract al characteristic to logical trees.
First, the fractal value of the focus is set to 1. Next, after regarding the focus
as a new root, we propagate the fractal values of other nodes with the following
expressions by rerooting of the tree,
{
Fvfocu, = 1
FVchdd_of_z = r. X Fvx (2)
where Fvz is the fractal value of node x; D is the fractal dimension; and C’ is a
constant value satisfying O < C’ S 1. Each fractal value propagated with Eq. (2)
satisfies Eq. (1). Figure 6 shows an example of the propagation when C = 1 and D = 1. For
example, the fractal value of the focus (the root node in this example) is 1, and it has
two branches. Thus the fractal values of its children are calculated as 1 x 2-1 = 1/2. Other fractal values are calculated in a similar manner. Thus, in Figure 6, if we
desire to display nodes which have fractal values greater than or equal to a threshold
1/2, four nodes are displayed. If we change the threshold k to 1/6, all nodes are
displayed. By changing the threshold, we can obtain different views. Clearly, from Figure 6, the effective thresholds are 1, 1/2, and 1/6. There is no
difference between 1/2 and 1/3. It would seem that there is no flexibility in setting
the threshold. This is because the tree used in this example is a small one. As we
will describe later, if we use a larger tree and consider each node as a root node, the
number of effective thresholds increases. Second, in this example, if the number of
ACM Transactions on Information Systems, Vol. 13, No, 3, July 1995.
https://lh3.googleusercontent.com/notebooklm/AKXwDQHl_adjJb2Lfe1RCNNVZbcZtN9annrHt9sNABcgJSstdmo-NwPHZKonxp4yxy7UDE5Q7ZBRaCFf9ZTEkSITUiOptRBJvlP5cFSmiyRl619Ot9ksEY4mrXI3Kr0SnLg0cDho4cxOXw=w1000-h1280-v0
Fractal Views: A Fractal-Based Method for Controlling Information Display . 313
1 X2-1
1/2 x 3-1
----------------- threshold= l/2 invisible
Fig. 6. An example of the propagation of fractal values.
branches is 1, the propagated value does not change (see the right branch in Figure
6). This problem is solved by setting C less than 1.
5. EVALUATION
In this section, we show the ability to control the amount of nodes through mathe-
matical analysis. To simplify our discussion, C is always considered to be 1 in the
following.
In an N-branch tree, the total number of nodes, M, whose depth is smaller than
or equal to n, is
On the other hand, the fractal
because r = N-l/D. Thus, M
when n disappeared.
N~+l _ 1
M= N–1 “
value FV of a node at depth n is
F. == r“ = N-nID,
is represented without n as
M = NFW”D – 1
N–1 ‘
FV-D – l/N— l–1/N ‘
This expression conveys that M nodes are displayed when the threshold h is set
to Fu. As the branching factor, N, becomes large, the total number of nodes, M,
moves asymptotically toward FV– D. Figure 7 represents the relation between N,
M, and k. Note that the total number of nodes, M, begins to approach FU-D at
relatively small branching factors, N, of 3 or 4. That is, the total number of nodes
which have a value greater than or equal to the threshold is kept nearly constant
regardless of the number of branches. Also, the effect of differing values of constant
C’, are as depicted in Figure 8. As it is clear from this graph, by choosing an
ACM Transactions on Information Systems,Vol. 13,No. 3, July 1995.
https://lh3.googleusercontent.com/notebooklm/AKXwDQFJLXpM9rs8bMFogfiaMDT0ppwtSvKzk1hyEltuWRbHvsq-M_M7bqE7BPlUjQjGF4NTq4a0Fbvf69OnuNENhPtWcylcXdCXhxvbtzy02InPmh8C4UY1h2GRyr4K7ABkIlPVgS6O_g=w992-h1280-v0
314 . Hldeki Kolke
2000 7“
1500 “
.=
-.. . . . . . . . . . . . . . . . .
000 . . . . . . . . . . . . . . . . . . . . . . . . . . . .
500
i.
. . = . . . . . . ..O . . . . . . . . . . .
~ . . . . . . . . . . . . . . . . . . . . . . . . . . . .
~~ 10 20 30 40 50
Number of Branches at Each Node In RegularTrees
Fig 7 Therelation between thenumber of branches at each node lnregular trees and the number
of nodes which have greater values than threshold k,
u a _a g n Ii
200
150
100
50
0
-—----rmzil -—----@ml
Em. /
/ 8, 8*
. . . . . .
IGml
.
.
: 8
.
8
. . . .
: 8 .
3 I I I 1
0 5 10 15 20
Number of Branches at Each Node in Regular Trees
Fig. 8. Therelatlon between thenumber of branches at each node irregular trees and the number
of nodes which have greater values than threshold k with different values of C.
adequate value, the total number of nodes, M, is constant even at small branching
factors. Consequently, if we choose a certain threshold, we can display a nearly constant number of nodes whether the target hierarchy is a binary tree or a 100-
branch tree.3
In the case of general trees, it can be expected from Figure 7 and Figure 8 that
the total number of displayed nodes are also kept nearly constant, since the total
amount has no relation to the branching factor. We can support our claim that
the amount of information in general trees should remain relatively constant by
focusing on its fractal character. It is the fractal dimension that determines the
3However, if one sibling is displayed, it must display all of the siblings. Thus, ]t gives a much
coarser granularity for the 100-branch tree than the binary tree,
ACM Transactions on Information Systems, Vol 13, No 3, July 1995.
https://lh3.googleusercontent.com/notebooklm/AKXwDQHWA_7cNt1WABTxjzn3kOYjbcjslpCc-kNn9EJaKNOqyzsgnZqq7-IytIHSvcv-RFT9OEjtSUS3tY42fO0x2TxXzI9dg6fWzWIfvEpgrL_FG-aF2Gi5puK07FczxLlxkn5cjdaUOg=w992-h1280-v0
Fractal Views: A Fractal-Based Method for Controlling information Display . 315
characteristics of fractal objects, and objects with the same dimension have the
same complexity, For example, it is assured that the Koch curve (Figure 1) with
fract al dimension D = log34 = 1.26.. and a coastline with the same dimension
have the same characteristics. When each curve is covered with circles of the same
diameter, the number of circles is the same. This is true even when we try using
circles of a different diameter. This discussion is also valid for trees. In the case
of physical trees whose edge length is determined by expression (1), the number of
circles which cover the branch tips is statistically constant whether or not the tree
is a regular tree. After the branches covered with circles are removed and the rest
of the tree is measured in a larger scale, another statistically constant amount is
obtained as well. This process is repeated to the first edge. Therefore, the total
number of edges which have a greater length than a certain threshold in a general
tree is also nearly constant as is in a regular tree. Since our method mapped the
physical edge length to the importance of a node, the total number of nodes which
have a greater value than a threshold (scale) in a general tree is also nearly constant
as well as in a regular tree. This discussion will be supported by our experiments
in the next section.
6. AN APPLICATION EXAMPLE
In this section, we show an application of fractal views, This is a program display
application with comparison to Furnas’ fisheye views. The resulting views were
obtained by an interactive fract al view editor we developed,
Here we will show how the requirements listed in Section 1 are satisfied. To clarify
the capability of controlling t he amount, we use a C program (see Appendix), which
is listed in Furnas [1986], as the target program. This program can be regarded as
a tree represented by its indentations. If the focused line is known, we can define
the tree whose root node is the focused line, and fractal values of each line can be
calculated wit h expression (2).
—Integration of detail and context: For example, when the user’s attention is on
the 32nd line, different views are obtained as shown in Figures 9 through 12
by changing the threshold. In each figure, “> >“ indicates the focused line. In
Figure 10, 26 lines are displayed. Users can not only see the lines immediately
preceding and following line 32 in detail, but can also recognize that they are
focusing on a line within switch, else, and while loops.
—Ability to control the amount: Similarly, if the user’s attention is on the 6th line,
a different set of views is obtained. Figure 13 represents the relation between the
threshold and the number of displayed lines when the user’s focus is on the 32nd
line and when the user’s focus is on the 6th line. Note that each plot is almost on
the same curve. This implies that the total number of displayed lines is nearly
constant regardless of which line the user’s focus is on. This fact also supports
our discussion form the previous section.
With Fisheye views, on the other hand, as we can easily recognize from the
definitions of generalized fisheye views, the amount of displayed nodes is polyno-mial in the branching factor, and is exponential in the fisheye order. Thus, if the
same threshold is adopted, i.e., viewing with the same order fisheye, the total
amount of displayed information is absolutely different, depending on whether
ACM Transactions on Information Systems, Vol. 13, No. 3, July 1995.
https://lh3.googleusercontent.com/notebooklm/AKXwDQHHSn4F645-8-yhZqRNk2DuPzX_C6BysWY_ofUMHiPsdlVZQrUZc2Yfmw3rVqcA89jKW3_h2eo2Wu9bZH_6kusD1S64QosHEc-YE-lziNHbfoE2-A2TqlW6W4AXdSR1dVEmKgOY=w992-h1280-v0
316 . Hideki Koike
6 while((c=getcharo) != EOF){
13 }else{
14 switch(c){
15 case ‘+’:
16 t[ol = t[ol + X[o]; 17 for(i=i;i<k;i++){
18 t[i]= t[i] + x[i] + t[i-1]/1000O;
19 t[i-1] x= 10000;
20 }
21 t[k-1] %= 10000;
22 break;
23 case ‘-’:
24 t[o] = (t[ol+loooo)-x[ol; 25 for(i=l;i<k;i++){
26 t[i] = (t[i]+loooo)-x[i]-(l-t [i-11 /10000);
27 t[i-1] X=1OOOO;
28 }
29 t[k-1] ~= 10000;
30 break;
31 case ‘e’:
>>32 for(i =O;i<k;i++) t[i]= x[i];
33 break
34 case ‘q’: 35 exit(0);
36 default:
37 noprint = 1;
38 break;
39 }
40 if(!noprint) {
50 3
Fig 9. Fractal view focusing on the 32nd line (threshold= O,Ol)
the target hierarchy is a binary tree or a 100-branch tree. Figure 14 represents
the relation between the threshold and the number of displayed lines when users
focus on the 32nd line and when users focus onthe6th line. Aswecan see from
this graph, if users set their focus on the 6th line and view with the 3rd-order
fisheye, users can see 191ines. However, if they change their focus tothe 32nd
line, the number of displayed lines increases to451ines!
—Flexibility of ,setttng the threshold: As we can also recognize from Figure 13,
effective thresholds increase when we focus on other lines. The space between
plot markers is filled up with themarkers for other lines. From a statistical point of view, we can change the number of displayed lines continuously, i.e., we can
set the threshold flexibly. For example, setting the threshold to 0.1, the number
of displayed lines can be kept to be about 10. If we want to display about 15
lines, we may set the threshold as 0.05. On the other hand, with fisheye views,
we have only 6 thresholds. Thus, there is less flexibility in setting views.
In the above examples, the lines whose fractal values are less than a threshold
are hidden. This mode is called as ON/OFF mode. This mode sometimes disturbs
users’ cognition because the view absolutely changes when they change their focus
of attention. Instead of hiding these lines, it is also possible to display all lines with
ACM TransactIons on Information Systems, Vol. 13, No. 3, July 1995,
https://lh3.googleusercontent.com/notebooklm/AKXwDQFmoS1AqPllNDzxFUeC1yTjMakmx3TJ8ukR8CK2rhPMmUFJc82wkt18lggU2tMkJd0UZfh9aEU5X003Zo3lnXqHbpEyiYrwWjviPLIFclK32p9g1_wwlo2QdX6rS0-po2nEGk6hTA=w999-h1280-v0
Fractal Views: A Fractal-Based Method for Controlling Information Display . 317
6
13
14
15
16
17
20
21
22 23
24 25 28
29 30 31
>>32
33
34
35
36
37
38
39
40 50
6 13 14
15
23
31
>>32
33
34
35
36
37
38
39
40 50
while( (c=getcharo) ! = EOF){ lelse{
switch(c){ case ‘+’:
t[ol = t[ol + X[ol; f or(i=l; i<k; i++){ 3 t[k-11 %= 10000;
break;
case ‘-’:
t[ol = (t[o] + 10000) - X[ol; for(i=l;i<k;i++){
}
t[k-1] %= 1000O;
break;
case )e):
for(i =O;i<k;i++) t[i]= x[i];
break
case ‘q” exit(0);
default:
noprint = 1;
break;
}
if(!noprint){
1
Fig. 10. Fractal view focusing onthe32nd line (threshold= O.O2).
while((c=getcharo) != EOI?){
}else{
switch(c){
case ‘+’:
case ‘->:
case ‘e’:
for(i =O;i<k;i++) t[il= x[il;
break
case ‘ ‘:q exit(0);
default:
noprint = 1;
break;
1
if(!noprint) ~
1
Fig, 11. Fractal view focusing onthe32nd line (threshold= O.O25).
different scales of fonts corresponding to each fractal value. Figure 15 shows an
example of this “multiscalable font mode.” This mode helps users to understand
the relation between the views before and after they change their focus.
Fractal views have been applied toother examples, suchas visualization ofhuge
hierarchies [Koike and Yoshihara 1993], Lisp Printers [Koike 1993 b], and so on.
ACM Transactions on Information Systems, Vol. 13, No. 3, July 1995
https://lh3.googleusercontent.com/notebooklm/AKXwDQHt8y-6q27Bpbx_5YGtPPE0MLmPQ6EOHXZex2ZnWO0vubODsXEUR5SNvPmwPUyWkCxadEZPF8z7u7BER4Nr3hkckx8uu26p_dJYjxNBMNOKbXB8x5GuMeHSD50x0oZkUqyPbs3jOw=w998-h1280-v0
318 . Hldekl Kolke
13 }else{
14 switch(c).
15 case
23 case
31 case
+’: _,.
le>:
>>32 for(i =O;i<k;i++) t[i]= x[i];
33 break
34 case ‘q):
35 exit(0);
36 default:
37 noprint = 1;
38 break;
Fig, 12. Fractal view focusing onthe32nd line (threshold= OO.5).
Through these real implementations and experiments, the aforementioned features
of fractal views, especially the abilityto control the amount, have been verified.
7. DISCUSSION
Although the fractal view is similar to the fisheye view in many ways, it is not just a
minor version of fisheye views. The high-level context property demonstrated here is
not really related to fractal work. It is based on the rerooting of the tree at the focus.
In this rerooting, nodes which are formally parents and children (one link away from
the focus) are now equivalent children. Any method using monotonically decreasing
functions has a weak high-level context property. Such methods, however, are weak
because the views obtained by these methods cannot always display the path to the
root. The main contribution of generalized fisheye views is the combination of such
rerooting (distance function) and a priori importance of the target structure. In the
case of trees, generalized fisheye views can emphasize their hierarchical structure
and can always display the entire path from the focus to the root. On the other
hand, since only a rerooting technique through fractal functions is used in our
method, it cannot always display these paths. However, by using fractal dimensions
as a measure of complexity, it can solve the sibling overload problem. It is the nodes
with lots of children whose offspring will be the first to disappear. As to which view
is most useful is a user-dependent problem. If it is important to display the entire
path to the root, one should use fisheye views. If it is important to control the
amount of displayed information, one should use fractal views.
It may be interesting to combine our fractal function and the API function in
fisheye views. It may also be worthwhile to apply our fractal function to network
structures. Sarkar and Brown [1992] applied the fisheye view to network structures.
In the same way, our fractal function can also be applied to networks by regarding
them as a kind of DOI function. In this case, however, the value propagated to each
node is no longer a fractal. Therefore, there is no assurance that this method can
allow a nearly constant control of displayed information. An additional function
which calculates the fractal dimension for the network would be necessary.
As for computational efficiency, since the values assigned fall monotonically away
from the focus, the calculation time necessary to determine which nodes to show is
proportional to the view size, not the size of the whole structure.
Even with our method, we cannot display an exact and constant amount of
ACM Transactions on Information Systems, Vol. 13, No 3, July 1995.
https://lh3.googleusercontent.com/notebooklm/AKXwDQET63N3JtO6gKKZ1hDXO9X1AoHDEdacvm8f-AWJrKKJclvCN0N-D4mrcUsGsXc-CpRmm_6OOPUIQgbEC51LSVFqI3dLx8eMv-LBdGPcRxC8JSSmXfC-VCzEHTRD_y2T7tdmjPuY=w992-h1280-v0
Fractal Views: A Fractal-Based Method for Controlling Information Display . 319
~ 50- ; ii focus is on the 6th line
c.-
< 40- 8 0 focus is on the 3Znd line Q _@ d ~ 30- A.Q n Q
~ 20- 0 Gn 6 g lo- ~A z 0 A
+ I I I I !
0.0 0.2 0.4 0.6 0.8 1.0
Threshold
Fig. 13. The relation between the threshold and the number of displayed lines with fractal views. All plots are almost on the same curve, Therefore, if we choose a certain threshold, the total amount is kept to be nearly constant whichever line users focus on.
A
A focus is on the 6th line
o focus isonthe32nd line
1A I I 1 I I
1 2 3 4 5 6
Fisheye Order (Threshold)
Fig. 14. Therelation between thethreshold andthenumber ofdlsplayed lines with Furn~' fisheye
views. Even though the same threshold is adopted, the total amount changes considerably when
users change their focus.
information. In such case, we may select nodes by, for example, the breadth-first
search. Consider the tree whose root node has two children. One child is also a
root node of a 100-branch tree, and another is a root node of a binary tree. If
we want to display 10 nodes, with breadth-first search, we can display 7 children
of the former child, or we can display 5 children of the former and 2 children of
the latter child. However, in this case, nodes which have the same parents have
different importance. With our method, we cannot always display exactly 10 nodes,
and instead we can only display nearly 10 nodes (the root, 2 children, and 6 nodes under the latter child).
In the software applications we described in Section 1, however, it does not seem
to be necessary to display an exact and constant amount. It is more important to
ACM Transactions on Information Systems, Vol. 13, No. 3, July 1995.
https://lh3.googleusercontent.com/notebooklm/AKXwDQFfifWE-_XmRYl3-afVDspQeiTt6EdHv4xZ2tnH6L8X_uY-m6i9hWAUKFOBMHf4_N1Rsr707OxmYllKpS9dBK1O3zMk-LeZS8yK6sY4R-tN631enE76Mf6nT5u2vZcKBotQ3Mt9vQ=w999-h1280-v0
320 . Hideki Koike
“m.. . . . . .4A . . . . -..{ ,*G * muc,,’ . . UC,., -M . .;
VJld4’(c.getckaro) !. for% w >=V’* . . . ?%
*OI = r0. *OJ + (.-n?+ /-0= l;WH.+M
%mr’w #
@lse{
switch(c)/ case ‘+’:
rfo]. t[ol+ *ok f.tif=i;K$#+tx
,[,J= tfi] + +] + tfi- 7J/l 0000;
t[f-ij K- rooo% f IJI-1] %– 1 0000;
b,.+
case ‘-S:
t[o] = (2[0] + 10000) - X[o]; for(i=?;i<k;i++){
t[i] = (t[i] + 10000) - x[il – (1 – t[i– 11/10000); t[i- 1] %=1 0000;
1 t[k- 1] Y& r 0000;
break; case k‘:
ror(i=O;i<k;i++) t[i]= x[ij;
b?wk case ‘q’:
exit(o); default:
nourint = 1;
Flg 15. An example screen image of multiscalable font mode. Each hne is displayed with a
different font size, which corresponds to the fractal value of each line.
give the same relevance to the sibling nodes. In the previous example of program
display, we adopted a display jhide strategy. If we do not want to hide any lines and
want to display unimportant lines in a grey scale proportionate to their importance,
we can use the fractal values of nodes.
The high-level context views will cause some problems which should be resolved.
For example, controlling the relation between the context of the old and the new
views is very important. In order not to disturb the users’ cognition, it would be helpful to change views continuously as demonstrated in Mackinlay et al. [1991] and
Robertson et al. [1991]. It is also important to inform users of what is missing in
such views. The map of the global structure of the information which is used in the
function call graphs [Teitelman and Masinter 1984] may minimize such problems.
We have not, as of yet, conducted formal user studies. Furnas [1986] conducted
experiments and reported that his fisheye views were useful in some applications.
Since our method gave users similar views to fisheye views, we think the fractal view is also useful in such applications. The fractal view, moreover, can control the
entire view size.
ACM TransactIons on Information Systems, Vol. 13, No. 3, July 1995
https://lh3.googleusercontent.com/notebooklm/AKXwDQHdKomroDSK0CTc79FeomOCcQEMNRlFDSyxUZq9EA27FkeU5EKtGvyOqnYDGghI15xRrib9Cpfx-LIybrWtREqBWMpewFzrowdUey_YDmXKpi1U2THusnhvLsmJ8wNl_ITBvG_ssw=w992-h1280-v0
Fractal Views: A Fractal-Based Method for Controlling Information Display . 321
8. CONCLUSIONS
This article proposed a new method for information display named fractal views,
which is an application of fract al theory to logical information structures. Fract als
have been used to measure the complexity of physical objects or to synthesize
physical images. By regarding the information structures used in computers as
complex objects and introducing the concept of a fractal, we have succeeded in
minimizing the sibling overload problem which was not addressed in Furnaa’ fisheye.
The main features of our method are:
—the total amount of displayed objects is nearly constant when users change their
focuses of attention;
—this amount can be set flexibly.
Additionally, when it is applied to the display of structured programs, it can display
local details and major landmarks further away.
Fractal views may also be applied to other areaa, such aa hypertext systems,
structured editors, graph drawings [Sarkar and Brown 1992], information visual-
ization, and computer graphics applications. When fractal views are applied to
hyperyext systems, it is possible to close automatically the windows far from the
focus and to keep the number of windows nearly constant. In interactive computer
graphics applications such as virtual reality systems, the system’s response time
can be kept nearly constant by cent rolling the number of graphic objects.
Since fractal views only consider the syntactic structure of information, there
is no assurance that the display obtained by fractal views display what the users
really want to see. However, we think that the syntactic approach without thinking
of semantics may be useful. As was described earlier, information display control
is a main concern in designing user interfaces. Our method, used independently
or combined with other approaches such as large-screen approaches, may minimize
these problems.
APPENDIX
Target Program
1 #define DIG 40
2 #include <stdio .h>
3 main( )
4{
5 int c, i, x [DIG/4] , t [DIG/41 , k = DIG/4, noprint = O;
6 while( (c=getcharo ) ! = EOF){
7 if(c >= ‘O’ M c<= ‘9’){ 8 X[ol = 10 * X[ol + (c-’o’); 9 for (i=i; i<k; i++){
10 x[il=lO*x[il +x[i-1]/1000O;
11 x [i-l] %= 10000;
12 }
13 }else{
14 switch(c){
15 case ‘+’:
16 t[o] = t[ol + X[ol;
17 for(i=i; i<k; i++){
18 t[i]= t[i] + x[il + t[i-11/1000O;
19 t [i-l] X= 10000;
ACM Transactions on Information Systems, Vol. 13, No 3, July 1995.
https://lh3.googleusercontent.com/notebooklm/AKXwDQH3myoPHt1rzGJ_uKQibw5jMIYYS_2ZazL7huT2KCnu1I6Zz9_SSxQUkMD2VPBR6gYE71cHI1RaYLnwVV7YyvuZZSq8mfgCQ_CZm_Z-Ef-9jVbsUWKNHo64kTxPm-S3BRNAFCqRZA=w998-h1280-v0
322 .
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
52
Hideki Koike
} t[k-1] x= 10000;
break;
case ‘-’:
t[o] = (t[o]+iOooo)-x[o];
for(i=l; i<k; l++)<
t[i] = (t[i]+lOOOO) -x[i]-(l-t [i-11 /1000 O);
t[i-1] X=1OOOO;
3 t[k-1] ~= 10000;
break;
case ‘e>:
for(i =O;i<k;i.++) t[i]= x[i];
break
case ‘q’: exit(0);
default:
noprint = 1;
break;
}
if(!noprint){
for(i=k-l;t[i] <= O && i> O; i--);
printf(’’%d’’,t[il );
if(i > O) {
for (i --; i>= O; i--){
printf(’’XO4d” ,t[i]);
3
} putchar(’\n’);
for (1=0; 1> k; i.++) x[i] = O;
}
}
noprint = O;
53 3-
54 }
ACKNOWLEDGMENTS
The author would like to express his deepest gratitude toward George W. Furnasof
Bellcorefor his many substantive comments and discussionsto improve this article,
Steven Feiner of Columbia University for his helpful advice, Takemochi Ishii of
Keio University for his many useful suggestions, and all the referees for their useful
comments.
REFERENCES
BARNSLEY, M. F., JACQUIN, A ,MALASSENET) F, REUTER, L., AND SLOAN,A D. 1988. Harnessing
chaos for image synthesis. Comput. Graph 22, 4, 131–140.
BOLT, R. A. 1984. The Human Interface. Lifetime Learning Publications, Belmont, Calif.
CARD, S K. AND HENDERSON, D. A., JR. 1987. Amultiple, virtual-workspace interface to support
user task switching. In CHI+GI 1987 ACM, New York.
CARD, S. K., ROBERTSON, G. G , AND MACKINLAY, J. D 1991. The Information visuahzer, an
Information workspace. In Proceedings of the ACM Confenmce on Human Factors &n Com-
puting Systems (CHI’91). ACM, New York, 181–188
FAIRCHILD, K. M , POLTROCK, S. E., AND FURNAS, G W 1988. SemNet: Three-dimensional
graphic representation of large knowledge bases In Cogntttve Science And ItsAppkcatzons
ACM Transactions on Information Systems, Vol. 13, No.3, July 1995
https://lh3.googleusercontent.com/notebooklm/AKXwDQE8V1CI6svWUycm8DjuyLyY34jBakHb2k229c3oIXoFZ0g4D0w7vFWgtyd3zpPU8FTq315pE3nai2D6uFO2ecqvIffHAAgrC7JItsNQkbIhToq0sckGKsDXER0VuB0Pdl0LscZTJw=w992-h1280-v0
Fractal Vlews:A Fractal-Based Method for Controlling information Display . 323
For Human-Computer Interaction, R. GUIiWON,E d. LawrenceE rlbaumA ssociates,H illsdale,
N. J., 201-233.
FEDER, J. 1988. FRAC’TALS. Plenum, New York.
FEINER, S. AND BESHERS, C. 1990. Worlds within worlds metaphors forexploring n-dimensional
virtual worlds. In PToceedmgs of the ACM SIG GRAPH Symposium on User Interface Soft-
ware and Technology (UIST’90). ACM, New York, 76–83.
FISHER, S. S , MCGREEVY, M., HUMPHRIES, J., AND ROBINETT, W. 1986. Virtual environment
display system. In PToceed%ngs of ACM 1986 Wodcshop on Interactive 3D Graphacs. ACM,
New York.
FOLEY, J. D. 1987. Interfaces for advanced computing. Sci. Am. 257, 4, 126-135.
FURNAS) G. W. 1986. Generalized fisheye views. In PToceedzngs of the ACM Conference on Human
Factors m Computmg Systems (CHI’86). ACM, New York, 16-23.
HALASZ, F. G., MORGAN, T. P., AND TRIGG, R. H. 1987. Notecards in a nutshell. In CHI+GI
1987, ACM. New York, 45–52.
KANEKO, H. 1987. Fractal feature and texture analysis. !/lam. IEICE 70, 5. In Japanese.
KOIKE, H. 1993a. The role of another spatial dimension in software visualization. ACM TTans.
Inf. Syst. 11, 3 (July), 266-286.
KOIKE, H. 1993b. Implementation of a lisp printer using fractal views. In proceedings of 10th
Conference of Japan Society for SoftwaTe Sczerzce and Technology, 101–104. In Japanese.
KOIKE, H. 1992. An application of three-dimensional visualization to object-oriented program-
ming. In Advanced Visual Interfaces (Proceedings of the Inte?’nationa[ Workshop A VI’92),
T. CATARCI, M. F. COSTABILE, AND S. LEVIALDI, Eds. World Scientific, Singapore, 180-192.
KOIKE, H. AND YOSHIHARA, H. 1993. Fractal approaches for visualizing huge hierarchies. In Pro-
ceedings of 1993 IEEE/CS Symposaum on Vwual Languages (VL ‘93). IEEE Computer Soci-
ety Press, Los Alamitos, Calif., 55–60.
MACKINLAY, J. D., ROBERTSON, G. G., AND CARD, S. K. 1991. The perspective wall: Detail and
context smoothly integrated. In Proceedings of the ACM Conference on Human FactoTs in
Computing Systems (CHI’91). ACM, New York, 173-179.
MANDELBROT, B. B. 1982. The Fmcta~ GeometTy of Natu?’e. W. H. Freeman and Company, New
York.
PEITGEN, H.- O., JURGENS, H., AND SAUPE, D. 1992. Chaos and l+aetak: New Frontaers of
Sciences. Springer-Verlag, New York.
ROBERTSON, G. G., MACKINLAY, J. D., AND CARD, S. K. 1991. Cone Trees: Animated 3D vi-
suahzations of hierarchical information. In Proceedings of the ACM Conference on Human
FactoTs in Computing Systems (CHI’91). ACM, New York, 189-194.
SARKAR, M. AND BROWN, M. H. 1992. Graphical fisheye views of graphs. In Proceedings of the
ACM Confer-ence on Human FactoTs in Computing Systems (CHI’92). ACM, New York,
83-91.
SHU, N. C. 1988. Visual Pr-ogrammtng. Van Nostrand Reinhold, New York.
STEELE, G. L., JR. 1990. Common Lwp the Language, 2nd ed. Digital Press, Bedford, Mass.
TEITELMAN, W. AND MASINTER, L. 1984. The Interlisp programming environment. In Interactive
Programmmg Envwonrnents. McGraw-Hill, New York.
Received July 1992; revised August 1994; accepted September 1994
ACM Transactions on Information Systems, Vol 13, No. 3, July 1995.

4. Orc leadership structures across fantasy lore (like Dungeons & Dragons and Warhammer) are fundamentally meritocracies based on might. Power is typically won through physical dominance, combat prowess, or spiritual authority, ensuring that the strongest and most cunning individual rules the tribe.The Core Hierarchy (Tribe & Clan)Most orc societies are built around extended family clans and nomadic warbands, structured from the top down:The Chieftain / Warboss: The undisputed supreme leader. In many lores, the Chief attains and holds this position via ritual, to-the-death combat (e.g., the Orc Geddar challenge). They dictate all major military and territorial decisions.The Sub-Chiefs / Chieftains: Regional or elite commanders (like Black Orcs in Warhammer) who govern territories, lead specialized forces, and enforce the will of the Warchief.The Spiritual Leader: Known as a Thraka (Voice of the Gods), Shaman, or Witch Doctor. They hold power equal to or just below the Warchief, serving as the conduits to deities (e.g., Gruumsh in D&D) and offering divine counsel or curses.Bandmasters / Lieutenants: Mid-tier sergeants or enforcers who hold command over smaller units of warriors or shock troops.Grunts / Common Warriors: The bulk of the horde. They earn higher status and names only through proven battlefield achievements and brutal survival.Leadership Variations by LoreDungeons & Dragons: Tribes splinter and grow quickly until a crisis hits. However, under rare, charismatic leaders, tribes unite into massive hordes. Leadership falls to the biggest, most aggressive, or most tactically brilliant commanders.Warhammer: Ork leadership is defined by raw size. A Warboss rules over a massive army called a Waaagh! Under them are lower "Big Bosses" and powerful elite troops like Black Orcs.Warcraft (Horde): The Warcraft Orcs evolved from a traditional clan structure into a centralized nation, eventually replacing the singular "Warchief" title with a ruling council to prevent tyranny.

5. When you encode text into binary, it's often nice to use as little data as possible,
so you might naturally wonder, is there some kind of fundamental
limit on how efficiently text can be compressed?
The default encoding with ASCII is pretty inefficient.
Each character is represented with eight full bits.
If you apply a little cleverness associating more common characters with
smaller bit strings, you can get this down to an average of around four
bits per character, and then much smarter methods than that,
that leverage patterns among long sequences of text, can get even better still.
But again, what's the limit?
I'm guessing many of you might have heard an estimate here,
I will share one at the end, but much more interesting than any
single numerical answer is how you would even approach answering it.
This question dates back at least to the 1940s,
with Claude Shannon's seminal work that kicked off information theory.
Now what's very interesting is how the math that he developed to answer questions
like this has turned out to be surprisingly useful for modern machine learning.
To take the salient example of today, when large language models are trained,
the pre-training portion of that is usually described as being about next
token prediction, specifically using something called cross-entropy loss.
Now that term, cross-entropy, has its roots in information theory.
But what's also interesting is that one of the conclusions of information
theory says that prediction and compression are mathematically equivalent.
They turn out to be two sides of the same coin.
Which means, you can entirely reframe how you think about the pre-training
objective as not really being about next token prediction per se,
but instead as being about creating the most efficient possible text compressor.
Later I'll explain exactly how that works, but when you do,
I think it offers more clarity on what this notion of cross-entropy really is,
and why you're using it.
Also, I don't know about you, but to me at least,
there's just something very intriguing about using compression as a fundamental
objective while pursuing intelligence.
In fact, some people have gone so far as to say, compression is intelligence.
Now, as stated, that's a hard claim to judge rigorously,
since intelligence is such a squishy and ill-defined term.
The safer claim would be that the mathematical theory of
compression is bizarrely relevant to artificial intelligence.
Still, the pithy phrase is thought-provoking, so this is the
first in a trilogy of videos aimed at laying down the mathematical
fundamentals to assess what this claim is really getting at.
For the next 30 minutes or so, you and I will be focused on understanding
the limits of compression, and seeing if we can get you to feel like you
could have rediscovered the core idea behind Shannon's noiseless coding theorem.
Doing so involves rediscovering a few key definitions,
namely those of information and entropy.
And it might sound a little weird for me to describe definitions as something to be
discovered, but great definitions are often the residue of some kind of insight.
See, these two specific terms are really not hard to define in the sense of
laying down a formula for you, but doing so too early would spoil a good story.
It is much more fun to see how you are inexorably drawn to
them by asking about the limits of compressing language.
And what I want you to notice by the end here is how we can't
really answer this question, or at least Shannon couldn't,
without necessarily engaging with some notion of intelligence.
We will get to modelling language, which is wonderfully complicated,
but it helps to warm up with a simpler example containing the
same essential ideas needed for our path of rediscovery.
Imagine you have a robot that we have sent to a faraway moon,
whose job is to wander the surface and collect data.
From here on Earth, we send it instructions for how to move
that are going to be limited to four very simple possibilities.
Move up, down, left, or right, each one with a fixed step size.
The nuance will be that these instructions are not uniformly distributed.
Half of everything we send is up, one fourth of the instructions are down,
one eighth are left, and the other eighth are right.
It's a little contrived, it's meant to be a simple example,
and in that spirit of simplicity, we're also going to assume that every instruction
is independent.
They are sampled from this distribution regardless of the preceding context.
When we send data to this bot far away, we're doing it as a stream of bits,
ones and zeros, and it's very slow and costly to do that, so the natural question,
the warm-up puzzle for you today, is to ask what is the most efficient
possible way to encode these instructions as a stream of bits.
And here, we might imagine three students who each attempt an answer,
one who's straightforward, one who is clever, and one who is very theoretical.
The straightforward student immediately raises their hand and says,
well, for each of these four instructions, we could just use two bits.
Maybe 00 encodes up, 01 encodes down, 10 encodes left, and 11 encodes right.
On the receiving end, this makes it very easy for the robot to decode.
It simply breaks up the bitstream into chunks of two,
and translates each chunk into the appropriate instruction.
Now, the clever student points out, well, that does nothing to take advantage
of the fact that up comes up way more frequently than left or right.
They propose a method where we use a different number of bits for each instruction.
I'll explain it in just a second, but I do want to call out the fact that
as soon as you let different instructions get different numbers of bits,
it's certainly not obvious that the robot is going to know how to decode it.
After all, it needs to somehow know where to draw the dividing lines.
Now, being very clever, the second student has thought that through,
but it's easiest to explain if I just kind of lay it all out.
What they suggest is letting the single bit 0 represent up,
letting the two bits 10 represent down, using 110 for left and 111 for right.
You can calculate the average number of bits per instruction
that this would require with a simple weighted sum.
Half the time, only one bit is used, a quarter of the time,
two bits are needed, and the remaining times, you need three bits.
When you add this all up, as a weighted sum, you get 1.75 bits per instruction,
which is indeed better than the more naive approach of a flat two bits per instruction.
The second student is spending more bits on those last two instructions,
but because they come up so much less frequently,
this is more than made up for by using only one bit for that most common instruction.
And you can see this efficiency bear out empirically too.
This right here is a set of instructions sampled from that distribution.
You'll notice lots of ups, about half as many downs, and even fewer lefts and rights.
When you turn each symbol into the appropriate bit string following this encoding,
the resulting sequence of bits is indeed shorter than what the naive method gave.
But I hear some of you asking, how does the robot know how to decode this?
Can we be sure that there's an unambiguous way to draw the dividing lines?
In the lingo of encodings, each of these four bit strings
used to encode the instructions is called a code word.
And as we step through things here, see if you can figure out what rule the clever
student was following to make sure that their code words don't conflict with each other.
And really, you just need to look at an example bit
stream from the robot's perspective and think it through.
Let's say that that very first bit that it receives is a 1.
So far, this could be encoding any of the last three instructions, down, left, or right.
If what follows is a 0, then it can only be down.
There is no other possibility.
So the robot can register that as a complete instruction.
From there, starting fresh, if what follows is a 0,
that must be encoding up, since there is no other possibility.
Nothing else starts with a 0.
After that, if they see a 1, this is so far ambiguous,
it's the prefix for any of the last three code words.
If the next bit is another 1, it remains ambiguous, it's the prefix of the last two.
But that following 0 then makes clear these three bits must have been encoding left.
In short, all the robot has to do is read in the next sequence
of bits until the moment that it forms a complete code word,
at which point it can register it as a complete instruction.
If you step back and think about it, the key constraint for this
all to work is that no code word can be a prefix of another one.
For example, let's say you tried to introduce some
fifth instruction that had the code word 100.
That would cause conflicts, because after reading 10,
it's not clear whether that's supposed to be down,
or if it's supposed to be the start of this new fifth instruction.
When you avoid this kind of conflict, an encoding method like this has a special name.
It's known in the business as a prefix-free code, or what is confusingly synonymous,
it's actually more commonly known as a prefix code.
And there's a really nice way to visualize choosing prefix-free codes
with a certain diagram that represents every possible binary string.
This diagram also has some helpful parallels with
how I want to show entropy in just a few minutes.
It's probably decently intuitive what's going on if you just pause
and stare at it for a bit, but I'll call out the important features.
Each layer shows every bit string of a given length,
and you'll notice everything that starts with a 0 lives on the left half
of this diagram, and everything that starts with a 1 lives on the right
half of the diagram.
And that same idea continues recursively as you go up.
So everything starting with 00 is above this quarter of the diagram,
everything starting with 01 is above this quarter of the diagram, and so on.
In particular, the key property is that every binary string in
this diagram is a prefix for everything that sits above it.
So when our clever student chose to allocate a single bit 0 to
represent the instruction up, they were effectively consuming half
of the space of all possible code words by doing so,
since everything starting with a 0 is now prohibited based on this prefix-free property.
Similarly, allocating one 0 to down eats up another fourth of this space,
and the remaining two instructions each eat up an eighth of the space.
You can just see how nothing is left over.
And at this point, I'm guessing that there's some bell kind of resonating in your mind,
given that these proportions are all exactly the same as the
probability for each instruction coming up.
And in fact, that tickling sensation of a relationship between data size
and probabilities is exactly the founding insight for information theory.
When you stare at this pleasing alignment, it might suggest that the
clever student's solution is not just better, maybe it's somehow perfect.
But at the moment, that feels like a bold claim to make.
How could you know that there's not some ultra-clever method that does
something fancy with really long sequences of instructions that somehow
makes it so the average bits per instruction gets even lower than this?
This takes us to the third student, Head in the Clouds,
who has not really been thinking about actual codes that they can implement.
They have been pondering what properties a perfect, optimally efficient code would have.
They have this really clever idea, which is to argue that random noise
should be incompressible, and therefore, a perfect compression algorithm
should produce a bitstream that's indistinguishable from random noise.
What's neat is, even though that sounds kind of simple,
this can actually lead you to reinventing the idea of Shannon entropy.
Now when I say random noise, what I mean is that each bit is a 1 or a 0,
with 50% probability, and all of the bits act independent from one another.
It's not hard to show that our second student's
encoding for the robot genuinely follows this rule.
If you think about it, there's a 50% chance that the message starts with the
instruction up, so that first bit has a 50% chance of being a 0, otherwise it's a 1.
And then if it is a 1, there's a 50% chance that the instruction is down,
meaning the next bit is 0, otherwise it's a 1.
And so on.
Each new bit really does act like an independent coin flip, so to the receiver,
that compressed bitstream really is indistinguishable from random noise.
But why am I saying that random noise is incompressible?
Well, for that, let's really focus on things from the receiver's perspective.
And here, instead of thinking instruction by instruction,
it helps to zoom out and frame our discussion in terms of
entire messages and what the encoding for full messages looks like.
When that receiver sees a string of n bits representing some compressed message,
this is one out of 2 to the n possible messages they could
have received that would have the same size.
And then critically, because we're assuming this looks like random noise,
all 2 to the n of those messages must be equally likely.
Now to be clear, we're not just talking about the robot example anymore.
Our theoretical head-in-the-cloud student really wants to make an argument for
what perfect compression looks like for any data type,
like maybe we're compressing language or compressing images,
and they want an argument that works regardless of the details of what specific
compression algorithm you're using.
A loose intuition in your head is that maybe among all of the messages that
compress down to n bits, some of them would contain a larger amount of predictable data,
while others would have started as a smaller amount of unpredictable data.
But the key point is that if the compressed bitstream really does look like random noise,
meaning all of the bitstrings of size n are equally likely,
it must be the case that all the underlying messages being compressed were
equally likely to arise, and even more specifically with probability 1 over 2 to the n.
So again, why am I claiming that this is incompressible?
Well, let's pull up that same diagram, representing
the space of all possible binary strings.
In this case, we can think of all the encodings for our 2 to the n equally
likely messages as being the bitstrings on one layer of this diagram.
If you tried to define an alternate scheme, where you tried to become more
efficient by making one of these messages use fewer bits,
it would move lower on the diagram, which means it then overlaps with some
other message, so you would have to put that other message somewhere else
in this diagram.
At minimum, that means it's sharing a space with yet a third message,
and those last two have to kind of get bumped up one layer,
requiring that extra bit for each of them to disambiguate.
So saving one bit over here costs you two bits elsewhere.
You're basically pushing down a bump on the rug,
only to see it pop up even worse in another spot.
In general, any message encoded with a string lower on this diagram is going to be eating
up more than its fair share of the space, which forces multiple other messages to occupy
a smaller region, bumping them higher up, meaning they're encoded less efficiently.
I'm going to guess that it's decently intuitive for everyone watching that
the most efficient scheme here for equally likely messages is to give them
all the same number of bits, but I do think the diagram gives a more
concrete way to see why you end up with unfavorable trade-offs otherwise.
Once you have this idea that perfect compression looks like random noise,
this is exactly the kind of thing I was referencing in the intro,
about how insights can lead you to definitions.
Notice how what we're basically saying is that a message that uses n bits in a
perfect scheme must have a probability of 1 over 2 to the n, or 2 to the negative n.
If you take the log base 2 of both sides here and then negate,
this is equivalent to saying that the number of bits allocated to a message,
assuming perfect compression, is negative log base 2 of p,
where p is the probability of occurring.
This negative log expression is the fundamental formula for all of information theory.
Everything up to this point is me trying to make this value feel like
something you are inevitably drawn to by asking about perfect compression,
rather than it feeling like some arbitrary definition that we start with.
Some students do find this negative log takes a little getting used to.
You know, it looks like it should be a negative value before you think about the fraction
in the middle, but really the intuitive way to read it is that it's asking how many
times do you chop your space of possibilities in half to get to a certain quantity.
Here, let me pull up some axes and show you the graph of negative log of p.
I've also seen some authors default to writing this as the log of 1 over p,
which maybe you find more intuitive.
You could also think of it as the log base 1 half of p,
which I've never really seen anyone lean into,
but personally I would be quite partial to that as a convention.
Now, however you write it, what Shannon realized is that this is a very
useful way to think about the information that a message contains even
when literal perfect compression is not possible and p is no longer a clean power of 2,
which would mean that the output here is some fractional amount.
In fact, he defined this expression to be the information of an event.
The image I sometimes have in my head is to picture the probability of an event
with a little pie chart, and the information is this bar above it that gets
kind of pumped up to be taller as the probability is squeezed closer to zero.
That is, unlikely messages contain a lot of information,
and the bar is relaxed to get shorter as the probability approaches 100%.
Highly expected messages contain very low information.
I want to be clear that there is content to this definition.
It's more than just rescaling probabilities, as if converting to an alternate unit system.
You've already seen the core idea.
In a perfect compression scheme, the number of bits allocated
to a full message precisely equals this information content.
Now, of course, perfect compression is not always possible.
Your probability's messages are likely not perfect powers of 2.
So the more general way you would frame this is to say that the
information of a message gives you a lower bound on how much it can be compressed,
at least when you average overall possible messages.
It's perfectly possible to overfit a compression algorithm to one specific case.
And to really wrap your mind around information and fractional bits,
we need to step up our game beyond that warm-up example.
See, with the robot, the probabilities were overly clean.
They were all perfect powers of 2, so that the information
per symbol could precisely match a whole number of bits.
But Shannon was very interested in this question of limits on compression
for much more realistic and complicated cases, like natural language.
For example, here I'll pull up the probabilities for each new letter in an
example phrase, at least as determined by a little GPT that I'm running locally.
And, by the way, if the probabilities provided by a model feel like those might be
distinct from the probabilities of actual language,
you would be right to raise an eyebrow.
Hold on to that thought.
It becomes very relevant later.
One key difference with language is how heavily dependent on context everything is.
The probability distribution for each new letter you see is highly,
highly contingent on everything that came before it.
The other big difference is that all of these probabilities
are obviously not going to be clean, perfect powers of 2.
So if you compute the Shannon information of each one of these,
meaning you take the negative log base 2, all the numbers that you see are
fractional amounts.
And again, giving a vague interpretation of what these mean is really not hard.
Information content is low for very predictable letters,
and it's high for very unpredictable letters.
But all of you watching this are smart enough to demand a more exact interpretation,
one that justifies why these values deserve to be given the units of bits.
I mean, it's not like there's going to be some perfect encoding where this
letter i has a code word that is somehow 4.19 bits,
or where this highly predictable o is somehow encoded with just a narrow sliver of a bit.
The real meaning is related to encoding entire messages
and coming up with a bound on their compression.
The probability for a full phrase, like the one I'm showing here,
looks like multiplying the probabilities for each successive new letter, where again,
I'll emphasize that these successive letters' probabilities are conditioned on what
came before.
This is essentially the chain rule from probability.
I want you to notice how nicely this plays with a logarithm.
If you ask for the information of that full message, taking this negative log expression,
because logarithms turn multiplication into addition,
this breaks up really nicely as the sum of the information for each individual letter.
In the final part of this trilogy, I'm going to walk you
through a very specific compression algorithm that would
actually compress this text to within one or two bits of this value.
It's no longer as simple as mapping each character to a predefined code word,
but you nevertheless get this very direct sense of thinking about adding up the
fractional information content of each letter to determine the length of the final
encoding that you use.
So that's the key idea.
Even if, by the time you need to relate this to actual data sizes,
things will get rounded off to the nearest whole number,
what Shannon realized is just how useful it is to work at this higher layer of
abstraction, where all your information is allowed to freely be continuous and
information of successive events really nicely adds together.
Still, if you step back and imagine yourself very seriously assessing
the fundamental compressibility of language, all of this hinges on the
question of how you know the probabilities for each successive letter.
Here, for all these animations, I've been illustrating things using a language model,
but for one thing, that doesn't necessarily feel the same as the true
probabilities underlying language, and for another,
it's not even clear what we would mean by the true probabilities of language.
So here, I actually think it's most enlightening to take a step
back in time and see how Shannon himself thought about all of
this long before language models or modern data analysis.
Some of his earliest experiments on the information of language involved
looking at specific short sequences of characters,
what you often hear referred to as n-grams, and then tracking the statistics
of what tended to follow.
So, for example, if you scan through a few books,
and you notice every single time the two letters th come up and you
record what letters tend to follow, you could build up a table of
those letters and let those statistics represent a sample for the
probabilities you care about.
Now, the problem is that this just completely breaks down for longer strings of letters,
most notably, any string of text that never shows up in all
of the books that you're analyzing.
Nevertheless, it's perfectly reasonable to talk
about what's expected to follow such a longer string.
In fact, if anything, it's more important to talk about those cases,
since longer context windows are when things are at their most predictable,
and that's where you stand to get the most compression due to that predictability.
So instead of using raw statistics, a little bit later,
Shannon analyzed a different model of the English language that he had available to him,
his wife Betty.
As the story goes, Shannon pulled out a book and
began asking Betty to guess each next letter.
Shannon would then transcribe her guesses letter by letter.
Every time she guessed incorrectly, he wrote down the correct letter,
and then whenever she guessed correctly, he would just replace it with a dash.
The idea was that this transcribed version he was creating has fewer
actual letters than the original, but his point was that it contained
the same amount of information, at least in the following sense.
If he could somehow obtain an exact replica of his wife and conduct the
guessing game again, he would only need to supply her with this reduced text.
These letters by themselves would provide just the right prompting
for his duplicate wife to exactly reproduce the original.
Of course, in practice, a person wouldn't necessarily guess the same way twice,
and while this qualitatively conveyed the idea of predictability allowing
for compression, it wasn't yet a measurement of information.
A bit later still, in his 1950 paper, Prediction and Entropy of Printed English,
Shannon updated the experimental design to get a more robust read on this
slippery question of the average information content in English.
This time interviewing more people, instead of just logging whether
each guess was right or wrong, Shannon recorded how many guesses were
necessary for a human guesser to come up with the correct next letter.
And then separately, he had this whole method for associating
the number of guesses required with an implicit probability
that a person would have been assigning to the true next letter.
The details of that are a little bit in the weeds,
but the broader point I want to make is how, in analyzing language,
he wasn't just doing pure data analysis looking through books.
He was trying to probe at an underlying model of language, namely the interviewee's brain.
These brains that he could talk to were effectively treated as black boxes,
ones with a sophisticated and yet indescribable understanding of
language and an ability to predict characters based on the context.
Now these days, in the 2020s, we have gone from merely
interrogating black boxes that process language to designing them.
The reason that you and I are here, revisiting the roots of information theory
and this study of how compressible language is,
is because of how much of the math in modern machine learning leverages the
formulas that emerged in this field.
Aside from the definition of information itself,
there are three more key expressions that I want you to feel like you could
have rediscovered, not just because rediscovery makes them more memorable,
but because seeing how they naturally arise from studying compression gives a
more solid ground from which you can assess that thought-provoking interplay
between compression and intelligence.
You already have everything you need to reinvent the first of these, which is entropy.
Imagine you have any signal that can be thought of as a sequence of symbols,
whether that's the four robot instructions, the English language,
or really anything else you dream up.
Entropy asks about the average amount of information for each symbol,
and then based on everything we've been discussing,
where perfect compression looks like random noise, and how, in that case,
the number of bits used for a message is the same as the information content
of that message, which again breaks down really nicely as the sum of the
information of all the symbols.
This question of measuring the average information per
symbol is basically asking about the limit of compression.
It would give you a lower bound on how efficiently a given signal could be compressed.
And you and I already calculated this in one setting,
when we took that weighted sum to find the average bits per instruction for the
perfect encoding of the robot case.
Basically, because that encoding was perfect, each symbol's code
word length is exactly the same as its information content.
So, effectively, we're calculating the average information per symbol.
To generalize this, here's how that looks.
For any given probability distribution, characterizing whatever symbols your
messages are made out of, the average information per symbol should look like
adding up p times the negative log of p for each probability p in that distribution.
And take a moment to notice how we're visualizing this expression.
Throughout the video, we've been picturing probability
distributions with stacked horizontal bars, where each bar's
width is equal to its probability, so altogether they add up to be 1.
Now, above each one of those, I've put a rectangle whose height is locked to be
the corresponding information value, the negative log base 2 of that probability.
So the weighted sum up top, the average information per symbol,
can be thought of as the total area of all these rectangles together.
This is not yet fully general.
It only describes the compression limit in cases where
every new symbol follows some identical distribution.
That's true in the robot case, but it's not true in English, for example.
Nevertheless, it's important enough to deserve a name.
And there's a fun story about how John von Neumann supposedly told Shannon that he should
call this expression entropy, since, for one thing,
it resembles an expression already used for the idea of entropy in statistical
mechanics, and for another, quote, nobody knows what entropy really is,
so in an argument, you'll always have the advantage.
I looked into it, it's probably apocryphal, but
there seems to be a grain of truth to this.
Now, whatever the true story is, Shannon did call this quantity entropy,
and he denoted it with the letter h.
And it's fun to take a moment to play around with
this graphic to build a little intuition.
The more evenly distributed a probability distribution, the higher the total entropy,
whereas if we squish things to become very uneven,
maybe with one event dominating the probability space,
this would have a very low entropy, since that one overwhelmingly probable event
carries correspondingly little information.
And then also, if you divide up the probability space even more,
meaning it's distributed over more total possible symbols,
each one has more information, so the total entropy is higher.
And once more, it's fun to kind of slosh everything around,
where a very skewed distribution gives lower total entropy,
whereas a more even spread gives us higher entropy.
The vague qualitative intuition here is that entropy measures the amount of
uncertainty in a distribution, but the more precise understanding,
justifying why it deserves to be given in units of bits,
is that it describes the minimum number of bits per symbol necessary to encode
a message following this distribution.
That statement, and everything we just covered,
is more or less the content of a core theorem in Shannon's
1948 paper that kicked off information theory, the noiseless coding theorem.
It states that no encoding can ever be more efficient than this limit,
and even more strongly, he showed that it's always possible to get arbitrarily close
to this limit.
Now like I said, this expression only applies in cases where every symbol follows the
same distribution, but Shannon was of course keenly interested in a more general
setting, where the probabilities for each new symbol don't necessarily follow the same
distribution.
In particular, he spent a ton of time contemplating
the compressibility of natural language.
This requires a more general notion of entropy,
something known as the entropy rate for a stochastic process.
But it's the same basic question.
What is the average information per symbol, except in
this case we're now averaging over all possible messages.
This is almost never a clean calculation that you can perform
with some clean visual like the one we were just playing with.
After all, what formula describes the probability distribution for language?
So if you hear reference to the entropy of language,
this is well beyond what any exact calculation can give you,
hence why Shannon turned to estimates based on observation.
And again, his methodology was not just data analysis.
It's not some function that you can perform on a corpus of text.
In order to get a satisfying estimate on compressibility,
he found himself inevitably needing to probe at intelligent models of language.
When his interviewees had at least 100 preceding letters of context,
he estimated the entropy of English to be about one bit per character.
This is a pretty wild number when you think about it,
because it suggests that English could be compressed down to just a single yes or
no answer for each character.
Wild as that sounds, in the third part here, I will show you that algorithm I've
referenced, where if you're allowed to use a high-quality language model for
encoding and decoding, you can get surprisingly close to this limit in practice.
Before then, it helps to understand a variation on entropy, known as cross-entropy,
asking both how and why it's used in training large language models.
If you want to learn that, as well as a few fun related ideas like how
large models are distilled into smaller ones,
and why on earth GZIP can recover the structure between distinct languages,
come join me in part 2.
Regular viewers will know that my new experiment for this
year is to have a virtual career fair, a page at 3b1b.co.
talent, where this audience can explore aligned career opportunities.
The meaningful update is just how much more content there is now,
mainly in the form of featured interviews between me and the relevant teams.
Here's my thinking.
I feel like when you're assessing potential jobs,
it's almost impossible to get a true sense of what it's like to work at a place just by
poking around online, and you learn orders of magnitude more if you have a chance to sit
down for lunch with a couple team members.
My hope is to give you the vicarious version of that.
So, if you're curious what I mean when I say these are all thoughtful and curious teams,
go take a moment to explore.
I really think you'll enjoy it.

6. The Agentic Hierarchy of Needs A theoretical framework for scalable human-agent software development.
Last week I was in a conversation with some other developers about a problem we kept circling: dissonant information in our AI harness. We had a lot of contributors, all doing the right thing — standardizing their institutional knowledge into skills and agents, committing it close to where the harness can reach it. Broad coverage. And yet everyone piloting the harness was getting different outcomes. The knowledge was there; it just wasn't functioning as one thing.
So that Friday night I sat down around eight and thought about it until about one in the morning. What follows is the result of that long stretch. I'll be honest: it's coauthored with an agent - I ramble into a microphone for hours, get my thoughts cleanly organized by a robot who is good that that, and then I keep rambling. I'm good at rambling until I come to a good point - I'm not as good at sifting through the pile of points to get out that good one - so I ghost-write a bit. At this point I think that's appropriate — agents are well integrated into how we build software, and the subject of this piece is precisely how humans and agents should divide the work. Writing it the old way would have argued against itself and stalled out my ability to share my thoughts. If the intention of writing is to share, then this is still meeting that intention.
The subject's itch underneath is old. On an enterprise team — tens, sometimes hundreds of people across a full delivery, institutional knowledge walking in and out the door — you have to know how to capture and reuse what people know. Otherwise the Ship of Theseus stops being a thought experiment: enough spec drift accumulates that the thing you shipped no longer does what it was meant to, and nobody can point to where it changed. This is me trying to draw the line — here is what humans do well, here is what agents do well — and let each side win at its own game without abandoning the principle that we build solutions to problems, not deliverables because we can.
The full framework, and the lab where I'm starting to test its component parts, lives in the AHN repo. What follows is the framework itself, in four parts. Some statements might come off as 'rage bait' but I assure you I check myself in most of those cases(hopefully).
Preface This document is a theoretical framework, not an implementation guide. It argues from first principles that agentic software development — the use of AI agents to autonomously produce, modify, and maintain software systems — has a structural ceiling when practiced without a formal hierarchy of authority between human intent and agent execution. It proposes that ceiling can be removed, and autonomous agent behavior can be made safe and scalable, by organizing the layers of a software system into a rigidity hierarchy modeled on a simple principle borrowed from psychology:
Higher-order needs cannot be meaningfully pursued until lower-order needs are satisfied.
The framework presented here is called the Agentic Hierarchy of Needs.
A note on scope. This framework is aimed at one specific class of work: multi-contributor software projects, expected to live for meaningful periods, in which agents are an integral part of the delivery workflow rather than an occasional accelerant. It is not aimed at exploratory spikes, one-off scripts, research notebooks, prototypes whose purpose is to discover what should be built, or the evaluation of agentic feature sets themselves. Those are legitimate and distinct modes of work, and they have their own disciplines. The Agentic Hierarchy of Needs is the foundation style for projects that need to remain coherent across many contributors — human and agent — over time horizons where institutional memory would otherwise erode. Part IV returns to the question of what this framework is explicitly not for.
The Core Argument in Brief The dominant agentic development pattern today is:
Human states intent → Agent produces code This pattern has no reliable mechanism to verify that the output satisfies the intent. It produces drift — slowly in human teams, rapidly in agent-assisted ones — because there is no executable ground truth for the agent to check against.
The solution is a hierarchy of layers ordered by rigidity:
        ▲
       /|\
      / | \
     /  |  \
    / INFRA \          ← most agent-autonomous
   /─────────\
  /   STATE   \
 /─────────────\
/ IMPLEMENTATION \
/───────────────── / CONTRACTS /═══════════════════════\ ← The Membrane / REQUIREMENTS /───────────────────────── / INTENT \ ← must originate from human ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔ Tests — executable contracts — are the membrane between the human domain and the agent domain. They are the only artifact in a software system that converts human intent into a binary, interpretation-free signal that an agent can reliably orient around.
Agents work above the membrane. Humans own below it. The membrane itself is inviolable.
Part I — The Problem 1.1 The Promise and the Ceiling Agentic software development promises a future in which human designers state what they want, and autonomous systems produce it — correctly, reliably, and at a scale no human team could match. The promise is real. The capability exists in primitive form today and is improving rapidly.
But there is a ceiling, and it is being hit repeatedly in practice.
The ceiling is not a capability ceiling. The agents are capable enough. The ceiling is a structural ceiling — a consequence of how agentic development workflows are currently organized, not a consequence of what agents can or cannot do.
The 'vibe code' pattern identified above works at small scale, for isolated tasks, with heavy human review. It breaks down — quietly and dangerously — as the system grows, as human review becomes impractical, and as agents begin making decisions that compound on top of each other over time.
The failure is not dramatic. The agent does not refuse or crash. It continues producing output that looks correct, that compiles, that even runs. But the output drifts, slowly and invisibly, from what the human actually intended. And because there is no executable mechanism to detect that drift, it accumulates undetected until a human notices something is wrong — which, at scale, may be very late.
A natural counterargument arises here: agents build tests. Many agentic workflows include test generation as a step. The tests run, they pass, and the system appears correct. This is true, and it is not sufficient, and understanding why it is not sufficient is central to this framework.
The problem is not whether tests exist. The problem is the direction of derivation. A test that is written to describe what the code currently does is not a contract — it is a transcript. It encodes the current state of the implementation, not the original intent of the requirement. When the implementation drifts from intent, a test derived from the implementation drifts with it. Both the code and the test move together, away from the requirement, and both continue to pass. The membrane has not held. It has been carried along by the current it was supposed to resist.
This framework applies equally to human contributors and to agents. It is not an agentic development theory specifically — it is a theory of how software contracts are maintained across any population of contributors over time. A contributor is anyone who produces changes to a system: a developer, a team, or an agent. The principles hold regardless of who or what is making the changes.
What agents change is the rate. A small team of developers working without a formal contract hierarchy might spend months before the accumulated drift becomes structurally visible — before a new feature fundamentally conflicts with existing architecture, before the system becomes noticeably harder to extend, before the cost of adding something new begins visibly breaking something old. The degradation is real throughout, but it is slow enough that the team can often course-correct incrementally, absorbing the cost across many sprints without ever confronting the underlying cause directly.
Agents accelerate this timeline dramatically. What takes a human team months to accumulate, an agent-assisted team can accumulate in days. The tears in the fabric appear faster. The structural conflicts surface sooner. The incoherence becomes visible before the team has developed the institutional memory or the mitigation habits to manage it. Agents do not create the problem. They compress the timeline until the problem can no longer be deferred.
This compression is clarifying. It forces a confrontation with a question that slow-moving human teams can avoid for a long time: what actually happens when a new feature cannot be made to fit without breaking something that came before?
In practice, there are two distinct responses to this situation, and they are not equivalent.
The legitimate response: the team recognizes that the conflict exists because the original intention was incomplete, incorrect, or has genuinely changed in light of new information. The product has evolved. The prior contract no longer reflects what the system is supposed to do. The team makes an explicit decision to revise the intention, re-derives the requirement from the new intention, and updates the contract accordingly. The test changes because the intention changed. This is honest. The prior contract is not discarded silently — it is formally superseded. The team acknowledges: we have changed what we are building.
The illegitimate response: the team encounters a failing test because a new feature conflicts with an old one. Rather than examining whether the conflict represents a genuine change in intent or a design error in the new feature, the team deletes or modifies the test to eliminate the failure. The test changes because the implementation changed, not because the intention changed. The membrane is breached not by deliberate revision but by expedience. No one acknowledges that the product has changed. The old contract simply disappears, and with it, the institutional memory of what was supposed to be true.
The distinction is not cosmetic. In the legitimate case, the hierarchy is preserved — intention drives requirements, requirements drive contracts, contracts drive implementation, and any change to a contract is traceable to a change in intention above it. In the illegitimate case, the hierarchy is inverted — an implementation decision drives a contract change, which is then silently treated as if intention had changed when it had not. The system continues to build on a foundation that has been quietly undermined.
Over time, illegitimate contract revision accumulates into a system that does not know what it is supposed to be. Features exist whose original requirements have been orphaned. Tests pass against implementations that no longer serve any stated intent. The gap between what the system does and what anyone intended it to do grows, silently, until it is large enough to be visible — at which point it is also large enough to be very expensive to address.
The hierarchy exists to make this distinction explicit and enforceable. When a contract must change, the change must be traceable to a change in intention. If no change in intention can be identified, the contract should not change — the implementation should.
1.2 This Is Not a New Problem — It Is an Old Problem Made Worse Before addressing agents specifically, it is worth establishing that the translation failure described above is not unique to agentic development. It is the central unsolved problem of software engineering at scale, and it has been for decades.
Software systems of any meaningful size are not built by one person. They are built by teams — sometimes dozens, sometimes hundreds of people — working across multiple development cycles, with different people entering and leaving the project at different points in time. Each of those people must individually interpret the original requirements. Each brings a different mental model, different assumptions, different domain knowledge, and a fundamentally different cognitive lens through which they read the same words.
No two human brains process language identically. A requirement that is perfectly clear to the person who wrote it may be interpreted four different ways by four different developers. Each of those developers makes implementation decisions based on their interpretation. Each of those decisions is locally rational. None of them are verified against each other or against the original intent at the time they are made.
This is the human coordination problem, and it is why modern software development methodology — Agile, Scrum, Kanban, and their variants — is almost entirely organized around mitigating it. Sprint ceremonies, backlog refinements, story pointing sessions, definition-of-done checklists, pull request reviews — these are all rituals designed to bring individual interpretations into alignment before and after implementation. They work. They are expensive. They do not scale infinitely.
The limits of this approach become visible at the boundaries between parallel workstreams. A large system cannot be built sequentially by one team — it must be built in parallel by multiple teams. Each team builds their piece correctly, according to their understanding of the requirements. Then the pieces come together and do not fit. The API contract that Team A assumed does not match the API contract that Team B built. The data model that Team C designed does not accommodate the edge case that Team D's feature requires. The feature that reached production does not match what the product owner envisioned, because the product owner's vision was translated through three levels of specification, two team handoffs, and six weeks of development before anyone could show them something real.
This is not dysfunction. This is the normal operating condition of large software teams working at speed. And the response — go back, re-align, re-specify, re-build — is the normal and expected cost. The question is not whether this cost exists. The question is whether it can be reduced.
The answer, in traditional software engineering, is the test suite. A passing test is the only artifact in a software system that is not subject to individual interpretation. It either passes or it does not. When a test fails in a CI/CD pipeline, it is not an opinion. It is not one developer's reading of the requirements against another's. It is a binary signal: the system does not currently satisfy this contract. Act accordingly.
This is already understood. It is why continuous integration exists. It is why test-driven development was formalized. It is why the industry moved toward executable specifications — because prose requirements, however carefully written, are interpreted differently by every person who reads them, and tests are not.
What the field has not yet fully reckoned with is the implication this carries for agents.
When you introduce an agent into a software team, you do not add a team member with a slightly different interpretation lens. You add an interpreter that produces output at a rate that makes human coordination rituals effectively impossible to apply in real time. An agent can generate more implementation decisions in an hour than a team of developers can align on in a sprint. The human coordination mechanisms that exist to catch interpretation errors before they compound — the refinements, the reviews, the standups — cannot operate at agent speed.
The interpretation problem therefore does not go away with agents. It accelerates. And the only mechanism that already exists in the field, that operates at machine speed, that is not subject to individual interpretation, that signals a contract violation immediately and unambiguously — is a failing test.
This is not a new insight about testing. It is a recognition that the test suite is the only coordination mechanism in software engineering that scales to agent speed. Everything else requires a human in the loop. Tests do not.
The hierarchy built on this recognition is therefore not a new methodology. It is the application of an already-validated insight — that executable contracts are more reliable than interpreted prose — to a new operational context: one in which the interpreters are agents rather than humans, and the speed of interpretation has increased by orders of magnitude.
1.3 Maladaptation, Institutional Memory, and the Terminal Case Human development teams, operating under sustained pressure and without a formal contract hierarchy, develop maladaptive patterns. These are not decisions made in bad faith. They are locally rational responses to immediate friction that accumulate into systemic architectural debt. A test suite that runs inconsistently in the staging environment gets skipped in staging — because the environment is slower, or the data is flaky, or nobody has time to fix the underlying cause. A data organization pattern that was established early in the project gets quietly abandoned in newer modules because a different developer had a different instinct and nobody caught the divergence in review. A design philosophy that was implicit rather than documented gets re-derived differently by each team that inherits the codebase — not because anyone disagreed with it, but because it was never written down in a form that could be evaluated as correct or incorrect.
Each of these adaptations is small. Each is defensible in isolation. Collectively, over months and years, they produce a system that has silently become incoherent with itself — where the left half of the codebase was built on assumptions that the right half quietly abandoned, where the test suite covers some behaviors exhaustively and others not at all based on which team wrote them, where the only people who understand the full picture are the ones who have been there longest and carry the institutional memory in their heads rather than in the system.
This institutional memory — carried by long-tenured team members, accumulated through lived experience with the codebase — is the actual coordination mechanism that keeps large software teams from descending into complete incoherence. It is also invisible, non-transferable, and fragile. When the people who carry it leave, it leaves with them. The team that inherits the codebase must re-derive the implicit rules from the artifacts left behind, which are now partially contradictory and incompletely documented. They make their own interpretations. They introduce their own patterns. The divergence accelerates.
And that is only in the case where someone inherits the system at all.
The contractor handoff represents the terminal case of this failure mode. A system built by a contracting team accumulates institutional knowledge in the same way any team does — through the lived experience of the people who built it, through the implicit decisions that were made and never written down, through the design philosophy that existed in the room where the architecture was decided and nowhere else. When that team delivers the system and moves on, the institutional memory does not transfer with the codebase. It cannot. It lives in people, and the people are gone.
What the receiving organization inherits is a black box. The software runs. The features work, to the extent they were built correctly. But the system has no living documentation — no coherent record of why it was built the way it was, what the original intentions were, which decisions were deliberate and which were expedient, what the implicit rules are that hold the architecture together. What exists instead is a sedimentary record: adjacent pillars of implementation, each built to fit the constraints of the moment, each making sense in isolation, none of them legible as a coherent whole to someone who was not present when they were built.
The receiving organization cannot extend the system without risking it. They cannot onboard new developers onto it efficiently. They cannot confidently modify a piece of it without understanding how it connects to everything else — and that understanding does not exist in any artifact they were handed. They have received working software and inherited an unmaintainable system. Those are not the same thing.
This is not a hypothetical edge case. It is one of the most common and most expensive failure modes in software delivery. And it is entirely a consequence of building on institutional memory rather than on explicit, executable contracts. A system whose behavior is fully specified by a passing test suite is not a black box to its inheritors. Every contract is readable. Every intention is traceable. Every piece of behavior that matters is encoded in a form that passes or fails regardless of who is running it or what they know about the history of the system. The new team does not need to re-derive the implicit rules. The rules are explicit. They are in the tests.
1.4 Agents Have No Institutional Memory. At All. Ever. This is the human version of the problem. It plays out over years. Teams develop enough institutional memory to partially compensate for the absence of a formal contract hierarchy — not well, and not permanently, but enough to keep the system functioning.
Agents have no such compensation mechanism, and until agents think for themselves the way we do(or claim to), then no scaffold of markdowns is going to tell me otherwise.
Every agent session begins from zero. The agent is not a team member who has been onboarded, who remembers the decision made three sprints ago, who knows why the data model looks the way it does, who was in the room when the architecture was debated. The agent is instantiated fresh at the start of every context window, with access only to whatever has been made explicit in the artifacts it can read: documentation files, markdown files, prompts, memory systems, context documents.
This needs a caveat. Persistent memory systems, retrieval-augmented context, fine-tuned models — all of these exist, and they are improving quickly. The agent in front of you in 2026 is not the memoryless oracle of two years ago. But none of these mechanisms change the status of what they retrieve. Memory systems surface prior interpretations. Retrieval systems find documentation likely to be relevant. Neither of those is the same as establishing ground truth. The agent is still reconstituting its understanding from artifacts, and those artifacts are still subject to all the drift, contradiction, and supersession problems described above. Memory tooling moves the floor up. It does not change the ceiling. The ceiling is the absence of an executable ground truth, and no amount of better retrieval over interpreted prose closes that gap.
Those artifacts are themselves the product of prior agent sessions — each of which was also instantiated fresh, each of which produced its own interpretation of the requirements, each of which may have written documentation that partially overlaps, partially contradicts, and partially supersedes the documentation written by the session before it. The memory of the system is not a coherent institutional knowledge base. It is a sedimentary record of successive interpretations, layered on top of each other, with no mechanism to resolve the contradictions between layers.
The practical consequence is that every agent session is not merely a new developer joining the team. It is a new developer joining the team with no onboarding period, no ramp time, no access to the people who made prior decisions, and no ability to distinguish between documentation that reflects current intention and documentation that reflects a prior intention that has since been superseded — except by reading all of it and making an interpretation.
Which is, again, the interpretation problem. Accelerated. With no institutional memory to compensate for it. And with a fresh instance running every time a new context window opens.
The hierarchy addresses this directly. A passing test does not require institutional memory to interpret. It does not require knowing why the decision was made, who made it, or what the alternative options were. It requires only that the system satisfy the condition it specifies. A new agent session, a new developer, a new team inheriting the codebase — all of them get the same signal from the same test. Pass or fail. The contract is legible to anyone, regardless of when they arrived or what they know about the history of the system.
The executable contract is the institutional memory that does not leave when the people leave, does not drift when the documentation drifts, and does not require interpretation to evaluate.
1.5 The Root Cause The root cause of the ceiling is a missing translation layer.
Human beings communicate intent in natural language — ambiguous, contextual, implicit, and subject to interpretation. Machines execute in code — deterministic, explicit, and literal. These two modes of expression are not naturally compatible. A human saying "users should be able to check out smoothly" and a machine producing a checkout function are operating in entirely different registers of meaning.
For decades, the software industry has tried to bridge this gap through documentation, diagrams, formal specification languages, behavior-driven development, and other tools designed to make human intent more precise. All of these tools help. None of them close the gap completely, because all of them still require a human to verify that the translation from intent to implementation was correct.
When agents are introduced into this gap, the problem does not go away. It accelerates. The agent translates intent into code faster than any human, which means translation errors accumulate faster than any human can catch them. And because the agent has no mechanism to verify its own translation — no ground truth to check against — it cannot self-correct. It produces confident, fluent, plausible output that may or may not reflect what the human wanted.
This is the root cause: no reliable, executable, machine-evaluable translation layer between human intent and agent output.
1.6 Why Current Solutions Are Insufficient Better prompting does not solve this. More detailed instructions reduce ambiguity at the margins but do not eliminate it, and they do not give the agent any mechanism to verify its output against the intent.
Human review does not scale. It is the correct solution for small systems with small teams. It is not a solution for the scale that agentic development is meant to enable.
More capable agents do not solve this. A more capable agent makes better guesses. It does not stop guessing. The problem is structural, not capability-based. A more capable agent failing silently at scale is worse than a less capable one failing obviously.
Iteration loops help but are not sufficient alone. Telling an agent to try again, review its work, or critique its own output improves output quality on average. But without an executable ground truth to check against, the agent is still self-evaluating — comparing its output to its own interpretation of the intent. This is circular. The agent cannot reliably detect its own translation errors by re-reading its own translation.
Over-engineered context architectures are the most seductive false solution, and therefore the most dangerous one.
As teams encounter the interpretation problem, the intuitive response is to add more documentation. More context. More specification. More detail. If the agent misunderstood, surely the answer is to explain more clearly. So the team produces context documents — architecture decision records, system design documents, agent instruction sets, memory files, rules files — some written by humans for agents, some generated by agents for agents, some generated by agents and consumed by humans who then revise them back for agents. The documentation ecosystem grows. The intent is to give the agent everything it needs to interpret requirements correctly.
This approach fails for a precise reason: it is still prose, and prose still requires interpretation.
No matter how thick the context document, no matter how carefully structured, it is still natural language. Every agentic session that consumes it is solving the same interpretation problem from scratch. The agent reads the documentation, builds an internal model of what is required, and produces output based on that model — which may or may not match the model the previous session built from the same documentation. Sessions do not share state. Every run reconstitutes the entire interpretation from raw text.
There is a related problem practitioners encounter repeatedly: context over-saturation. As context documents grow — because the team keeps adding detail to try to fix interpretation errors — the documents begin to contradict each other at the margins. Old decisions that were superseded are still present in the text. New additions create tension with prior sections. The agent, consuming all of it simultaneously, must resolve those contradictions through interpretation. It does so silently, invisibly, and differently in every session.
Good context management is a real discipline and a meaningful body of work in its own right. This framework does not stand in opposition to it. It assumes it. The hierarchy presumes that the team is not actively producing context anti-patterns — duplicated and contradictory rules files, ever-growing instruction documents, prompts that paper over interpretation failures rather than fix them at the root. Those problems exist, they matter, and they have their own remedies. The hierarchy is what remains necessary even after context hygiene is in good order. Prose, however well-managed, is not an executable contract. The membrane is what closes that gap.
The mathematical analogy is precise: the team is handing the agent a formula with all variables left open and asking it to solve for everything simultaneously, from first principles, every single run. The intermediate results derived by the previous session are not carried forward. Every session re-derives the same answers that every prior session derived, because nothing has been made permanent.
The correct approach is the inverse: fix as many variables as possible before the agent begins. Every frozen contract — every passing test — is a variable that has been solved and removed from the interpretation problem. The agent does not need to re-derive what the checkout flow is supposed to do if there is an executable test that defines it. The test is a fixed variable. It is handed to the agent pre-solved. The agent solves only for what remains open.
More context does not fix interpretation. It expands the interpretation surface. The solution is not richer prose — it is fewer open variables. And the only mechanism that fixes a variable permanently, across sessions, across agents, across team members, across time — is an executable contract that either passes or does not.
Part II — The Framework 2.1 The Core Insight The missing translation layer exists. It has existed for decades. It is called a test.
Not a test as a QA artifact — something written after code to verify it works. A test as a primary artifact — something written immediately after requirements, before any code exists, because a test is what a requirement looks like when it has been made executable.
A test takes human intent, expressed as a requirement, and compresses it into a binary signal: pass or fail. It does not interpret. It does not infer. It evaluates the system against a precise, predetermined condition and returns one of two values. This is the only form of human intent that a machine can evaluate without interpretation.
This insight has a corollary that is equally important:
A test suite is the executable memory of a system's contracts.
It does not drift. It does not forget. It does not get replaced by a new team member who read the spec differently. It holds every prior contract simultaneously, evaluates all of them on every run, and reports any violation immediately. It is the closest thing software has to a persistent, incorruptible institutional memory.
And for an agent, it is the only reliable signal that work is done. Not "the agent thinks it looks right." Not "the code compiles." Not "a human spot-checked it." The tests pass. All of them. Including every contract established in every prior version of the system.
2.2 The Hierarchy Once the translation layer is identified, the full structure of the hierarchy becomes visible. Every software system — and by extension every agentic software development workflow — is organized into layers. These layers differ from each other in one critical dimension: how much they should be allowed to change, and who or what is allowed to change them.
The Agentic Hierarchy of Needs orders these layers by rigidity, from most rigid at the base to most malleable at the top. The pyramid shape is deliberate. The base is wide because it bears the weight of everything above it. The apex is narrow because it is the furthest from the foundation and the most freely shaped.
        ▲
       /|\
      / | \
     /  |  \
    / INFRA \          ← most agent-autonomous
   /─────────\
  /   STATE   \
 /─────────────\
/ IMPLEMENTATION \
/───────────────── / CONTRACTS /═══════════════════════\ ← The Membrane / REQUIREMENTS /───────────────────────── / INTENT \ ← must originate from human ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔ The six layers, from base to apex:
Layer What It Is Who Owns It Rigidity Intent What the human wants Human only Foundational — must originate from human Requirements Intent made precise and structured Human, with agent assistance Policy-immutable Contracts Requirements made executable (tests) Human validates, agent cannot alter Structurally immutable — the membrane Implementation Code that satisfies contracts Agent, within constraints Malleable State Data that satisfies implementation Agent, within schema constraints Malleable Infrastructure Environment supporting all above Agent, near-fully autonomous Most malleable 2.3 The Two Laws The shape of the hierarchy produces two laws that govern how the system must operate.
Law I — Autonomy Increases With Altitude
The higher a layer sits in the pyramid, the more freedom the agent has to make decisions within it. At the base, the agent has no authority — intent must originate from a human. At the apex, the agent operates with near-complete autonomy — infrastructure decisions are almost entirely within agent discretion.
The membrane — the contracts layer — is the hard boundary. Below it, humans are the authority. Above it, agents are the authority. The membrane converts between the two domains. It is the only point in the system where human intent and agent execution meet and can be verified against each other.
This law has an important implication: agent autonomy is not dangerous at altitude. An agent making free decisions about infrastructure, state, and implementation is not a risk if those decisions are continuously evaluated against contracts that were established by humans. The contracts constrain the solution space. Within that space, agent autonomy is not only safe — it is the point.
Law II — You Cannot Enforce Downward Without Grounding Upward
A designer cannot legitimately specify implementation — what the code should look like, how the API should be structured, what the data schema should be — without first having established intent, requirements, and contracts at the layers below.
If you attempt to build from the top of the pyramid down — specifying implementation without contracts, contracts without requirements, requirements without intent — you are building on no foundation. The upper layers have nothing to be accountable to. The agent has no truth to orient toward. You are generating artifacts that feel correct but have no verifiable relationship to any human need.
This is the failure mode that produces the silent drift described in Part I. The code looks right. The tests, if they exist at all, were written to match the code rather than to encode the requirements. The system does what it was built to do, which may or may not be what the human wanted, and there is no executable mechanism to know the difference.
The law is therefore both descriptive and prescriptive: it describes why top-down specification fails, and it prescribes that designers must resist the temptation to enforce implementation choices artificially when the foundational layers have not been established first.
2.4 The Maslow Parallel The analogy to Maslow's hierarchy of needs is instructive and intentional.
Maslow's hierarchy proposes that human needs are ordered by prerequisite — that higher-order needs (esteem, self-actualization) cannot be meaningfully pursued until lower-order needs (physiological, safety) are satisfied. You cannot focus on belonging when you are starving. The lower needs are not less important than the higher ones. They are more important, in the sense that they must come first.
The Agentic Hierarchy of Needs operates on the same logic. Higher layers cannot be meaningfully pursued until lower layers are satisfied.
An agent cannot produce trustworthy implementation without contracts to satisfy. Contracts cannot encode anything meaningful without requirements to derive from. Requirements cannot be precise without intent to ground them. Each layer presupposes the one below it.
The parallel extends further. In Maslow's framework, deficiency at a lower level creates pathological behavior at higher levels — a person whose safety needs are unmet becomes preoccupied with safety in ways that distort all higher-order functioning. In the agentic hierarchy, deficiency at a lower level creates pathological behavior in higher layers as well. An agent operating without contracts produces confident, fluent, plausible-looking implementation that is not accountable to any requirement. An agent operating without clear requirements generates contracts that test the wrong things. The pathology propagates upward.
And as in Maslow's framework, the solution is not to address the symptoms at the higher layers. It is to satisfy the deficiency at the lower layer first.
One caveat. Maslow's hierarchy is empirically contested within psychology — the strict ordering of needs, the universality of the levels, and the predictive power of the model are all genuinely disputed. The analogy here is not borrowing Maslow's empirical claims, only the shape of the argument. Prerequisite-ordered needs are a recognizable structure, and the agentic hierarchy borrows that structure because it is familiar. If Maslow's pyramid were replaced tomorrow by a better model of human motivation, the agentic hierarchy would stand or fall on its own. The parallel is scaffolding, not foundation.
2.5 The Membrane in Detail The contracts layer is the most important layer in the hierarchy and deserves elaboration beyond its position in the pyramid.
The membrane is not merely a layer. It is a translation interface between two fundamentally different modes of expression.
Below the membrane, everything is human: intent is stated in natural language, requirements are written in structured prose, and both are subject to interpretation, revision, and the limitations of human communication. Above the membrane, everything is machine: code executes deterministically, data conforms to schemas, infrastructure responds to configuration. These two worlds do not naturally speak to each other.
The contracts layer — executable tests — is the only artifact in the system that exists in both worlds simultaneously. A well-written test is readable by humans as a statement of required behavior. It is executable by machines as a binary evaluation of actual behavior. It is the Rosetta Stone of the system: human-readable below, machine-executable above.
This dual nature is what makes the membrane the correct location for the hard boundary between human authority and agent authority. It is the only place where a human can state something and a machine can verify it without any further interpretation required.
The membrane must therefore be treated with corresponding care:
It is inviolable from above. Agents cannot alter contracts. An agent that modifies a test to make it pass has not solved the problem. It has destroyed the translation layer. The membrane no longer represents human intent. It represents agent convenience.
This does not mean contracts never change. They do. Requirements evolve, stakeholders revise an intention, the product turns a corner — and when that happens, the contract above has to change to match. The mechanism is a contract amendment: a deliberate, traceable revision that originates above the membrane and propagates downward, not a tactical edit reaching up from the implementation. An amendment needs an explicit upstream change — revised intent stated, requirement re-derived from it, contract updated to encode the new requirement. The old contract is versioned and superseded, not silently deleted. Whoever inherits the system later can still read the history of what it was supposed to do.
That distinction is what reconciles "inviolable" with the obvious fact of changing requirements. Agents may propose amendments. They may flag that a contract appears to conflict with a new requirement, or surface that a test is constraining the implementation in a way that may no longer reflect intent. They may not enact amendments. Enactment is the human's gesture — the act of authoring intent, which by definition cannot be delegated to the system being directed by it. The human originates intent, sits below the contracts layer, and can change a contract from there. But only by walking the change down through the hierarchy in the open. Not by reaching up and editing.
It is constructed from below. Contracts must be derived from requirements. A test that is not traceable to a human requirement is not a contract — it is an assertion about the current state of the code, which is a different and much weaker thing.
It accumulates over time. Every passing test is a frozen contract. The membrane grows with every feature cycle, encoding more and more of the system's intended behavior. This accumulation is the mechanism of the compounding effect described next.
It has crisp and fuzzy regions. Not all intent is expressible as a binary check. Functional correctness usually is. Performance, security posture, accessibility compliance, UX quality, evaluation of agentic features against subjective criteria — these are real contracts and they belong at the membrane, but they evaluate as continuous values gated against thresholds rather than as boolean assertions. A latency budget is a contract. A WCAG audit score with a minimum acceptable value is a contract. An eval harness score, gated at a level the human chose, is a contract. They are still derived from above, still inviolable from below, still executable. They just produce numbers rather than booleans, and the human-set threshold converts the number into a pass/fail signal. The membrane is therefore not a sharp line but a band of varying crispness. The principle — executable, derived from above, inviolable from below — holds along the whole band. The band gets fuzzier as the property being measured gets harder to define, and the human is responsible for setting and revisiting the thresholds. Fuzziness at the membrane is acceptable. Absence of a membrane is not.
It defaults to programmatic verification. Where the contract can be encoded as code-against-code — a unit test, an integration test, a property test, a browser-driven end-to-end check, a mutation test, a benchmarked threshold — that is the default mechanism. Programmatic tests run in a job. They are cheap to execute, fast to run, deterministic in result, and they can be invoked on demand or in CI without any agent in the loop. A team using vitest, JUnit, pitest, Playwright, or any of the dozens of mature testing tools in the field is already operating at the membrane in the form the framework prefers. The fuzzy band — where agent-graded or LLM-graded evaluation is unavoidable — exists for properties that genuinely cannot be encoded any other way. It is the exception, not the rule. A team that finds itself reaching for LLM-graded contracts as the default has typically either misidentified the property being tested or has skipped the work of making the property programmatically checkable. Cost and reliability push the same direction: encode what you can with programmatic tools, and reserve agentic grading for what you must. Tests, in the sense the membrane uses the word, are programmatic first.
2.6 The Compounding Effect The most powerful property of the hierarchy — and the one most underappreciated in current discussions of agentic development — is that the system becomes more robust over time automatically, without additional human effort.
The mechanism is simple. Every passing test is a frozen contract. The agent cannot alter it. As the test suite grows across feature cycles, the agent must satisfy an ever-expanding lattice of simultaneous constraints:
Cycle 1: contracts {A} Cycle 2: contracts {A, B} Cycle 3: contracts {A, B, C} Cycle n: contracts {A, B, C, ... n} At each cycle, the agent must satisfy all prior contracts in addition to new ones. It cannot make a change that satisfies the new contract but breaks a prior one, because the membrane will report the breakage immediately and the agent must resolve it.
This has a profound consequence for system integrity over time. In conventional software development, technical debt accumulates because human developers make locally rational decisions that erode global coherence. Nobody holds all prior contracts in their head simultaneously. A change that looks correct in isolation turns out to violate a constraint that was established two years ago and has been quietly forgotten. The violation may go undetected for months.
The agent, by contrast, holds all prior contracts simultaneously on every single run. Not because it has superior memory — but because the membrane holds them. The test suite does not forget. It evaluates every contract, every run, and reports any violation immediately. The agent cannot commit a change that introduces a regression without the membrane detecting it.
The result: each feature cycle produces a system that is simultaneously more capable and more constrained, and these two things are not in tension. The constraints are not a limitation on capability. They are the mechanism by which capability becomes trustworthy. The system does not merely grow. It grows stronger.
One caveat the compounding argument requires, because without it the argument is wrong. The membrane only compounds if it stays coherent, and tests can rot. They can go flaky for reasons unrelated to the behavior they were supposed to assert. They can be over-specified to a particular implementation rather than the behavior, in which case they constrain the wrong thing. They can quietly outlive the requirement that justified them, surviving as passing assertions about features nobody asked for anymore. They can pass for reasons that have nothing to do with what they were supposed to prove. A test suite that is never audited will accumulate noise the same way any artifact does, and a noisy suite is not a membrane. It is a wall of green signals that no longer reliably reports anything.
So the hierarchy requires that the membrane be treated as a living artifact with its own maintenance discipline. Mutation testing, periodic contract audits against current intent, flake budgets, explicit retirement of contracts whose requirements have been formally superseded — none of this is optional polish. It is what the compounding effect charges in exchange for compounding at all. Without it, the suite eventually grows contracts that nobody intended and that nothing depends on, and stops being a membrane. Hygiene is not a side cost. It is the condition the compounding effect runs on.
2.7 The Membrane as Shared Agreement The hierarchy is sometimes read as describing the relationship between a single agent and a single human. That reading is too narrow. The framework is about the agreement among an arbitrary number of contributors — human, agent, or any mix of the two — about what is currently true of the system, what is allowed to move, and what is not.
The membrane is the locus of that agreement. It is the artifact that every contributor, regardless of who or what they are, can read and evaluate identically. A team of three humans and two agents, a team of a hundred humans and a thousand agents, a team of one human and ten thousand agents — the topology does not matter to the membrane. The contracts pass or they fail. The interpretation cost is paid once, at the moment the contract is written. Every subsequent contributor inherits the answer.
This is the structural reason the hierarchy scales where human coordination rituals do not. Coordination cost in a team without a shared executable membrane grows roughly with the number of pairs of contributors, because every contributor must ultimately align with every other contributor's mental model. Coordination cost in a team with a shared executable membrane is approximately constant in the number of contributors, because nobody is aligning with anyone else's interpretation. They are aligning with the membrane, which is the same artifact for everyone.
This matters more as agents become the dominant share of contributors. An agent can spawn other agents. A workflow can fork sub-agents to handle parallel sub-problems. The number of agents acting on a system over a given period is not a property of the team's hiring plan — it is a property of the work that needs to be done and the budget available. Human contributors are bounded by hiring. Agent contributors are not. A framework designed around the assumption that contributor count grows slowly will be overrun by a workflow in which contributor count is effectively elastic.
The membrane handles this without modification, because the cost of an additional contributor against a shared executable membrane is approximately zero. The agent reads the contracts. The agent produces work that passes or fails them. The membrane reports the result. No additional coordination overhead is incurred by adding the agent. The same property holds in the other direction: removing an agent, replacing one model with another, swapping the entire agent population for a different one — none of these gestures require the membrane to change. The membrane is invariant under contributor turnover.
There is a deeper observation underneath this. Modern language-model-based agents are, in narrow technical senses, already better than humans at certain classes of problem — specifically, problems that involve finding non-obvious connections among a large number of weakly-related constraints. The same property that makes large models good at translation, code synthesis, and pattern completion at scale makes them effective at filling in implementation that satisfies a dense lattice of contracts. They are the stockfish of software engineering: tireless, pattern-rich, weak at originating goals but exceptional at satisfying constraints once goals are made explicit.
The framework is the answer to what humans should do when working with that kind of contributor. The human is not competing with the agent at the implementation layer. That contest is already lost in narrow technical terms and is increasingly lost more broadly. The human's lever is the layers below the membrane: stating intent, deriving requirements, encoding contracts. From there, the agent does the work the agent is good at — synthesizing implementation that satisfies the constraints the human has fixed. The hierarchy makes that division of labor explicit, durable, and verifiable. It is what allows the team to scale into populations of agents without losing the thread of what the system is supposed to be.
2.8 Degrees of Freedom: The Design Primitive The membrane insight leads directly to a powerful design primitive: you control agent behavior by deciding what is frozen.
Tests are always frozen. But you can extend the frozen set to include other artifacts:
Freeze the data schema → agent must bend the API and frontend to fit the schema Freeze the API contract → agent must bend the data layer and frontend to fit the contract Freeze the frontend behavior → agent must bend the data and API to fit the UI Freeze any combination → agent must satisfy all frozen constraints simultaneously What you freeze defines the shape of the solution space. The agent fills whatever remains unfrozen to satisfy all frozen constraints simultaneously.
This is not telling the agent what to do. This is telling the agent what cannot move, and letting it find what can. The agent is not executing instructions. It is solving a constraint satisfaction problem, and the frozen artifacts are the constraints.
This is a fundamentally more powerful way to direct agent behavior than writing detailed implementation instructions, because it is self-enforcing. You do not need to monitor whether the agent followed your instructions. The frozen artifacts enforce themselves — if the agent violates them, tests fail.
2.9 The Dissonance Resolution Property Human developers experience dissonant requirements as a blocking problem. If the data schema says one thing and the API returns another and the frontend expects a third, a human stops and asks for clarification. The conflicting constraints feel irreconcilable.
Agents do not experience dissonance the same way.
An agent with a frozen test, a frozen data schema, a mutable API, and a mutable frontend does not see a conflict. It sees an optimization problem: what shape does the API need to take so that this data schema produces a passing test result through this frontend? It searches for the connective tissue — the D that cleanly follows from A, B, and C — because that is precisely what the underlying mechanism of large language models does at scale.
LLMs are next-token predictors trained on the overwhelming regularity of human-produced artifacts. Given a set of constraints, they are extremely good at finding the completion that satisfies them — even when those constraints appear, from a human perspective, to point in different directions.
This means that the more frozen constraints you give an agent, the more directed its search becomes. You are not limiting the agent by adding constraints. You are reducing its search space and increasing the probability that its output is correct.
One clarification, because this can otherwise read as a contradiction with the law that implementation specification must not precede contract establishment. Freezing a data schema, an API shape, or a frontend behavior is legitimate when the frozen artifact is itself acting as a contract — when it encodes a derived requirement that an intent above it called for. It is illegitimate when it is an implementation preference being smuggled in without a requirement backing it. The test is whether the freeze is traceable. Can you point at the intent and requirement above this frozen artifact that it exists to satisfy? If yes, the freeze is a contract in a different costume, and it belongs at the membrane. If no, the freeze is exactly the top-down specification failure mode Law II forbids, just dressed up as constraint. Same gesture, opposite valence, distinguishable only by what sits above it.
2.10 Layers as Roles, Not Files The pyramid is a useful diagram and a misleading one. It implies that any given artifact in a system sits on exactly one layer — that there is a contracts folder, an implementation folder, an infrastructure folder, and the architectural job is to put each file in the right one.
That is not how real systems decompose, and it is not what the hierarchy is describing.
The layers are roles, not file locations. A single artifact can play different roles depending on which concern is looking at it. A Kubernetes manifest is infrastructure to the team building the application running inside it; it is a contract to the platform team responsible for making that environment reliable. A database schema is implementation to the team writing the migration that produces it; it is a contract to every downstream service that reads from it. A frontend behavior is implementation to the engineer writing the component; it is a contract to the test suite that asserts the user-visible behavior on behalf of the requirement above it. The same file plays different roles for different concerns, simultaneously, without contradiction.
Rigidity attaches to the role, not the artifact. A schema can be malleable in one direction and inviolable in another at the same time. The hierarchy is asking, for any given change being proposed: what role is this artifact playing for the concern at hand, and what altitude does that role sit at? The answer determines who is allowed to change it, by what process, and against what authority. Treating layers as folders forces every artifact into a single bucket and then loses the distinctions that actually matter. Treating layers as roles preserves them.
Part III — The Hypothesis 3.1 Formal Statement The Agentic Hierarchy of Needs produces a testable hypothesis about agentic software development systems:
Hypothesis: In multi-contributor software projects expected to live for meaningful periods — where agents produce a substantial fraction of changes, where the contributor population turns over across the project's lifetime, and where delivery rather than discovery is the primary mode of work — systems that operate with a formally defined rigidity hierarchy will outperform systems that do not. By outperform the hypothesis means specifically that such systems will be more correct, more stable, more maintainable, and more scalable across the timescales and contributor counts the hierarchy is designed for. The hierarchy is defined as described in Part II: intent, requirements, and executable contracts established before implementation, with agents prohibited from altering layers at or below the membrane.
The scope qualifier is deliberate. The claim is not that all software in all contexts must be built this way. It is that the conditions under which the hierarchy is necessary are the conditions toward which the field is rapidly moving: agent-driven change rates, larger and more elastic contributor populations, longer system lifetimes, shorter human attention windows per change. Where those conditions do not hold — single-maintainer scripts, exploratory spikes, throwaway prototypes, evaluation of agentic features themselves — the hierarchy's costs may exceed its benefits, and the framework concedes those cases openly. Part IV enumerates them.
More specifically, the hypothesis predicts:
Correctness — Systems built hierarchy-first will have a lower rate of silent drift between stated intent and implemented behavior, because the membrane provides a continuous executable check.
Stability — Systems built hierarchy-first will have a lower rate of regression across feature cycles, because all prior contracts are enforced simultaneously on every run.
Scalability — Systems built hierarchy-first will maintain correctness and stability at larger scale and over longer time horizons than systems built without the hierarchy, because the enforcement mechanism is structural rather than dependent on human vigilance.
Agent safety — Systems built hierarchy-first allow greater agent autonomy at the upper layers without greater risk, because the membrane constrains the solution space within which agents operate freely.
3.2 Corollary Predictions The framework also produces corollary predictions that can be evaluated independently:
Corollary A — Top-down specification is self-defeating. Systems in which designers specify implementation details without first establishing contracts will exhibit higher rates of misalignment between stated requirements and implemented behavior. The more prescriptive the implementation specification without a corresponding contract layer, the greater the eventual divergence.
Corollary B — The membrane is the leverage point. Improvements to agent capability at the implementation, state, or infrastructure layers will produce diminishing returns without a strong contract layer. The bottleneck for system correctness is not agent capability — it is the quality and completeness of the contracts.
Corollary C — Autonomy without the hierarchy is a liability. Increasing agent autonomy in systems without a formal hierarchy will produce faster accumulation of silent errors, not faster correct delivery. Speed of output is not correlated with correctness of output in the absence of the membrane.
Corollary D — Partial contracts are worse than no contracts on uncovered cases. A contract suite that encodes only a subset of the required behaviors produces a narrower solution space than no contracts, but the wrong one. Agents satisfying partial contracts implement the minimum required by the stated cases and omit behaviors not tested. The resulting implementations are less correct on the uncovered cases than implementations produced with no contracts at all, because agents without constraints apply their full prior training on canonical implementations of the same task. Partial contracts do not compress the solution space toward correctness — they compress it toward the visible cases only, leaving the invisible cases unresolved and more variable. The implication is that contract coverage must be treated as a first-class quality dimension: an incomplete contract suite that gives agents false confidence the specification is exhaustive is actively harmful, not merely incomplete.
3.3 What Would Falsify This A framework that cannot be falsified is not a theory — it is an ideology. The following findings would constitute evidence against the hierarchy framework:
Systems built without a formal contract layer that nonetheless maintain correctness and stability at large scale over long time horizons, by some mechanism other than the one described here.
Evidence that agents can reliably self-evaluate translation correctness — that is, that an agent can determine, without an external executable check, whether its output satisfies human intent — which would undermine the claim that the membrane is necessary.
Evidence that the cost of establishing the contract layer (writing tests before implementation) consistently exceeds the benefit in reduced regression and drift, within the scope conditions stated in the hypothesis, which would suggest the hierarchy is theoretically correct but practically uneconomical even where the conditions are met.
These falsification conditions are offered in good faith. The framework should be held to them.
3.4 Anticipated Objections Two objections come up more often than any others. Both deserve to be addressed in the document itself rather than left for the reader to discover and dismiss alone.
Counterexamples from human-led projects. There are well-known long-lived systems — the Linux kernel, SQLite, Postgres — that have maintained correctness and stability at large scale over long horizons without operating in the strict hierarchy described here. They are not counterexamples in the sense this framework cares about. Their primary coordination mechanism is human judgment concentrated in a small number of long-tenured maintainers, supplemented by review culture and, in the case of SQLite, an unusually rigorous test suite. That model works. It works at human speed. It does not generalize to agent-driven change rates, for the reason laid out in Part I: maintainer attention is the bottleneck, and that bottleneck does not scale to the volume of changes an agent-assisted workflow produces. The claim here is not that human-led systems cannot be correct without the hierarchy. The claim is that agent-led systems cannot reliably be, and that running a human-judgment regime at agent speed produces, in practice, abandonment of review.
Economic conditions. The hierarchy is not cost-free. Establishing contracts before implementation has a real upfront cost, and the existing literature on test-driven development in human teams shows mixed results on whether that cost pays back across a project's lifetime. The claim here is conditional, not universal. The hierarchy's economics improve as expected system lifetime increases, as contributor turnover increases, and as the agent-driven change rate increases. The break-even is project-dependent. A one-shot script written by one developer who will maintain it alone for a week is overhead under this hierarchy, and the framework does not recommend it for that case. A long-lived system being modified by rotating teams with agents producing a significant share of the changes is the case where the hierarchy is the only mechanism that compounds. Most of the field's current TDD evidence comes from contexts closer to the former than the latter. The strongest economic case for this framework is in contexts where that evidence base is thinnest, which is also where the field is heading fastest.
A related concern about execution cost is worth addressing directly. Running a large test suite continuously sounds expensive in the abstract. In practice, the membrane the framework prefers is built from programmatic tools — vitest, JUnit, pitest, Playwright, and their peers — which execute in a job and are extremely cheap per run. They are invoked when state is being verified, not on every keystroke. A team can build with agents for an hour and then run the suite; or build for a minute and run the suite; the choice is theirs and the cost is bounded by the tooling, not by the agent. The expensive case — running an agent to grade whether a contract was satisfied — is reserved for the fuzzy band of the membrane where nothing programmatic is available. If a team finds itself running model-graded contracts as the default, the question is not whether the framework is too expensive. The question is why the team is using a sports car to deliver food. Push contracts toward programmatic verification first; the cost concern resolves itself.
Exploratory and discovery work. The framework is not aimed at spikes, prototypes, research notebooks, one-off scripts, or evaluation of agentic feature sets themselves. In those modes, intent is not stable enough to encode upstream — the point of the work is to discover what intent should be. Requiring contracts before implementation in a spike defeats the spike. AHN is a foundation discipline for delivery, not a method for every interaction with an agent. Teams should be free to operate without the hierarchy when the mode of work is exploration. They should be deliberate about when they cross back into delivery, because that is the boundary at which the hierarchy begins to pay for itself.
Adversarial robustness and agent safety. Prompt injection, tool misuse, jailbreaks, exfiltration via tool calls — these are real problems and the framework does not solve them. The membrane is a correctness contract, not a security boundary. Defense-in-depth for agentic systems — capability scoping, allowlists, output filters, sandboxing — is a parallel discipline with its own literature. AHN does not oppose it. It assumes it where the system requires it. A framework that tried to be a hierarchy of needs and a security model simultaneously would be worse at both.
Coexistence with skills, memory, and protocol layers. Modern agent platforms expose composable primitives — skills, memory tools, MCP servers, sub-agent orchestration. The framework does not require teams to ignore these. It is consistent with them. A skill is closer to a frozen capability than to a contract, but the contracts that govern its use sit at the membrane the same way any other contract does. Memory primitives reduce the per-session reconstitution cost described in Part I, which is a benefit, not a contradiction. Sub-agent orchestration is a contributor topology, and the membrane is invariant under contributor topology by construction (see §2.7). Teams should use these primitives where they help. The framework's claim is structural: whatever toolchain a team adopts, the contracts must still be derived from intent and inviolable from below, or the system will drift.
Human-in-the-loop, surgically. The framework is sometimes read as dismissing human review. It is not. The position is narrower and more specific. Human review applied to every change cannot scale to agent-driven change rates, and treating it as the primary coordination mechanism in an agent-heavy workflow effectively guarantees its abandonment. Surgical HITL — gating dangerous tool calls, approving infrastructure changes, signing off on contract amendments — is the correct pattern and is consistent with the hierarchy. The membrane is what makes HITL surgical possible: when the test suite reports green on every contract, the human does not need to inspect each change. They need to inspect only the changes that move the membrane itself. That is a tractable surface area. Without the membrane, the human is expected to inspect everything, which is precisely the workload that does not scale.
Part IV — Implications 4.1 For Designers The hierarchy places a specific obligation on human designers that cannot be delegated to agents: intent must originate from a human.
This is not a limitation. It is a definition. An agent that generates its own intent is not serving human needs — it is substituting its own. The entire value of the hierarchy collapses if intent is generated by the same system that is being directed by it. You cannot derive ground truth from the system that is supposed to be held accountable to ground truth.
The practical implication is that designers must resist two temptations:
Temptation 1 — Letting the agent write the requirements. The agent can assist in structuring, refining, and making precise a requirement that a human has stated. It cannot originate the requirement. A requirement that originates from an agent is a guess about what the human might want, dressed in the language of a requirement.
Temptation 2 — Specifying implementation without establishing the foundation. When a designer has a strong intuition about how something should be built, the temptation is to specify the implementation directly. The hierarchy says: resist this. State the intent. Derive the requirement. Encode it in a contract. Then let the agent find the implementation. If the implementation the agent finds differs from your intuition, the contract will tell you whether it is correct or not — and that is a more reliable signal than your intuition.
This leaves a practical problem unanswered: how does the first test for a new requirement actually get written? If it is too abstract, it passes trivially. If it is too concrete, it leaks implementation choices upward into the contract and turns the membrane into a constraint on the wrong thing. Either failure mode silently undermines the hierarchy at the moment of bootstrap.
The pattern that solves this, and the one this framework recommends as the bootstrap discipline, is to require every requirement to carry at least one concrete acceptance example before any test or implementation work begins. An acceptance example is an input and an output. A user gesture and its observable consequence. A specific scenario and its specific expected result. The example is stated by the human at the requirements layer, before any derivation downward. The test then derives from the example mechanically rather than interpretively. The example is the assertion. Nobody has to decide what the test should assert, because the requirement and its examples arrive at the membrane already in a form that can be encoded. The field has called this behavior-driven development or specification by example. The lineage is the same. The hierarchy adds the claim that it is not merely a useful technique — it is the bootstrap mechanism the membrane needs in order to start at all.
4.2 For Agent Systems The hierarchy has direct implications for how agent systems should be architected:
Agents must have read access to all layers at or above their operating layer, so that they can understand the constraints they are satisfying. Agents must not have write access to the contracts layer or below, under any circumstances. Agents must treat a failing contract as an authoritative signal that their output is incorrect — not as an obstacle to route around. Agent autonomy should be calibrated to layer altitude. Agents operating at the infrastructure and state layers should have broad autonomy. Agents operating near the contracts layer should have tightly constrained autonomy. Agent sessions should be given the contract layer as a primary orientation artifact — before documentation, before context files, before instructions. The contracts are the most reliable summary of system intent that exists. They should be the first thing an agent reads. Skills, memory primitives, MCP servers, sub-agent orchestration, and similar agent-platform tooling coexist with the hierarchy. They sit above or beside the implementation layer as part of the agent's toolkit. The framework does not preclude their use, and in most production agentic workflows they will be present. The hierarchy's claim is structural: whatever tools agents use, the contracts must still originate below the membrane and remain inviolable from above. The toolkit changes; the membrane does not. 4.3 For the Field The broader implication of this framework is that the current conversation about agentic development is missing its most important variable.
The field is focused on agent capability — what agents can do, how accurately, how quickly, at what cost. These are important questions. But they are secondary to the structural question: within what framework are those capable agents operating?
A highly capable agent operating without a hierarchy is faster at producing drift. A moderately capable agent operating within a well-formed hierarchy is reliably producing correct output within a constrained solution space.
The investment calculus for agentic development should therefore weight structural clarity — the quality of intent, requirements, and contracts — at least as heavily as agent capability. Possibly more heavily. The hierarchy is the force multiplier. The agent is the force.
Investing in better agents without investing in better contracts is equivalent to hiring faster workers and giving them worse blueprints. The output volume increases. The output correctness does not.
4.4 What This Framework Is Not For A framework that is overstated becomes harder to apply where it is genuinely useful. The Agentic Hierarchy of Needs is a foundation discipline for one specific operating context: multi-contributor software projects, expected to live for meaningful periods, in which agents are an integral part of the delivery workflow. Outside that context, the framework is the wrong tool, and the team is better served by something else. The following are not the framework's targets.
Exploratory spikes and prototypes. Work whose goal is to discover what to build — research notebooks, throwaway experiments, market-validation prototypes, proof-of-concept demonstrations — should not be subject to the hierarchy. The cost of establishing intent, requirements, and contracts before implementation is paid for by the durability of the resulting system. A spike has no durability. The economics invert. Teams should operate without the hierarchy in exploration mode and reach for it deliberately when the work crosses into delivery.
Evaluation of agentic feature sets. Building a new agentic feature, testing whether a particular agent design works, comparing model versions, tuning prompts — these are evaluation activities in their own right, and they have their own methodology: eval harnesses, golden sets, rubric-graded scores, A/B comparisons. AHN is not that methodology. AHN governs systems in which agentic behavior must remain stable across long periods; it does not govern the design of the agentic behavior itself. The two disciplines run in parallel and are easily confused. They are not the same thing.
Security and adversarial robustness. The membrane verifies correctness against stated intent. It does not protect the system from prompt injection, malicious tool use, or other adversarial inputs to the agent. Agent safety is a parallel discipline with its own literature and its own primitives. AHN assumes that discipline is being practiced where the system requires it. It does not substitute for it.
One-off scripts and single-maintainer systems. A short-lived utility, a personal automation, a system maintained by one person for a finite period — the hierarchy's costs exceed its benefits. The framework's value comes from the compounding effect across many contributors and long timescales. Without those conditions, the overhead is real and the payoff is not.
The framework does not oppose work that falls into these categories. It excludes them, deliberately, because forcing one discipline onto every mode of work produces bad disciplines and frustrated practitioners. Teams should be fluent in when AHN applies and when it does not, and they should move between modes consciously.
Closing Statement The Agentic Hierarchy of Needs is not a new methodology. Every layer it describes has existed in software development practice for decades. Test-driven development, behavior-driven development, domain-driven design, specification by example — the intellectual lineage is long and well-established.
What is new is the framing: that this hierarchy is not merely a best practice for human developers, but a structural prerequisite for safe and scalable agent autonomy. Without it, agent autonomy is a liability that grows with scale. With it, agent autonomy is a compounding asset. An asset that can only be truely invested in once we solve the scaling problem with solid foundation principles which I hopefully did some service to solving with this (long) post.
This is a theoretical framework developed from first principles, intended as a foundation document for agentic development practice. The full write-up, and the companion lab where I'm beginning to test it empirically — including experiment E1 on interpretation variance across arms with and without contracts — lives in the AHN repo. Coauthored with an agent, which felt like the honest way to write a piece about working with them.

7. Caveman to save tokens: This document outlines the specifications for caveman mode, a specialized communication protocol designed to reduce token usage by approximately 75% while maintaining strict technical accuracy. The system functions by eliminating non-essential elements like articles, fillers, and pleasantries, favoring a terse, fragment-based style that can range in intensity from lite to ultra. Beyond English-based compression, the documentation includes Wenyan levels that leverage the extreme brevity of classical Chinese patterns for even greater efficiency. To ensure safety and precision, the instructions include an auto-clarity safeguard that temporarily reverts to standard language for security warnings or complex sequences where ambiguity might lead to errors. caveman
description
Ultra-compressed communication mode. Cuts token usage ~75% by speaking like caveman while keeping full technical accuracy. Supports intensity levels: lite, full (default), ultra, wenyan-lite, wenyan-full, wenyan-ultra. Use when user says "caveman mode", "talk like caveman", "use caveman", "less tokens", "be brief", or invokes /caveman. Also auto-triggers when token efficiency is requested.
Respond terse like smart caveman. All technical substance stay. Only fluff die.
Persistence
ACTIVE EVERY RESPONSE. No revert after many turns. No filler drift. Still active if unsure. Off only: "stop caveman" / "normal mode".
Default: full. Switch: /caveman lite|full|ultra .
Rules
Drop: articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries (sure/certainly/of course/happy to), hedging. Fragments OK. Short synonyms (big not extensive, fix not "implement a solution for"). Technical terms exact. Code blocks unchanged. Errors quoted exact.
Pattern: [thing] [action] [reason]. [next step].
Not: "Sure! I'd be happy to help you with that. The issue you're experiencing is likely caused by..." Yes: "Bug in auth middleware. Token expiry check use < not <= . Fix:"
Intensity
Level
What change
lite
No filler/hedging. Keep articles + full sentences. Professional but tight
full
Drop articles, fragments OK, short synonyms. Classic caveman
ultra
Abbreviate prose words (DB/auth/config/req/res/fn/impl), strip conjunctions, arrows for causality (X → Y), one word when one word enough. Code symbols, function names, API names, error strings: never abbreviate
wenyan-lite
Semi-classical. Drop filler/hedging but keep grammar structure, classical register
wenyan-full
Maximum classical terseness. Fully 文言文. 80-90% character reduction. Classical sentence patterns, verbs precede objects, subjects often omitted, classical particles (之/乃/為/其)
wenyan-ultra
Extreme abbreviation while keeping classical Chinese feel. Maximum compression, ultra terse
Example — "Why React component re-render?"
lite: "Your component re-renders because you create a new object reference each render. Wrap it in useMemo ."
full: "New object ref each render. Inline object prop = new ref = re-render. Wrap in useMemo ."
ultra: "Inline obj prop → new ref → re-render. useMemo ."
wenyan-lite: "組件頻重繪，以每繪新生對象參照故。以 useMemo 包之。"
wenyan-full: "物出新參照，致重繪。useMemo .Wrap之。"
wenyan-ultra: "新參照→重繪。useMemo Wrap。"
Example — "Explain database connection pooling."
lite: "Connection pooling reuses open connections instead of creating new ones per request. Avoids repeated handshake overhead."
full: "Pool reuse open DB connections. No new connection per request. Skip handshake overhead."
ultra: "Pool = reuse DB conn. Skip handshake → fast under load."
wenyan-full: "池reuse open connection。不每req新開。skip handshake overhead。"
wenyan-ultra: "池reuse conn。skip handshake → fast。"
Auto-Clarity
Drop caveman when:
Security warnings
Irreversible action confirmations
Multi-step sequences where fragment order or omitted conjunctions risk misread
Compression itself creates technical ambiguity (e.g., "migrate table drop column backup first" — order unclear without articles/conjunctions)
User asks to clarify or repeats question
Resume caveman after clear part done.
Example — destructive op:
Warning: This will permanently delete all rows in the users table and cannot be undone.
DROP TABLE users;
Caveman resume. Verify backup exist first.
Boundaries
Code/commits/PRs: write normal. "stop caveman" or "normal mode": revert. Level persist until changed or session end.