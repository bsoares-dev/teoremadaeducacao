"""Build the editorial admin handbook without accessing production or secrets.

Requires ReportLab and pypdf. Fonts are embedded from the local Windows install.
Run from any directory: python scripts/create-admin-manual.py
The panel source is the authority for labels; review content after UI changes.
"""

from __future__ import annotations

import re
from html import escape
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "Manual-Administrativo-Teorema-da-Educacao.pdf"
FONT_ROOT = Path("C:/Windows/Fonts")
SITE = "https://www.teoremadaeducacao.com.br"
EDITION = "11/10/2026"
PAGE_COUNT = 12
W, H = A4
M = 44
CW = W - M * 2
NAVY = colors.HexColor("#112D43")
CREAM = colors.HexColor("#F6F3ED")
GOLD = colors.HexColor("#9A876B")
LIGHT_GOLD = colors.HexColor("#D5C6AF")
INK = colors.HexColor("#283D4A")
MUTED = colors.HexColor("#596770")
LINE = colors.HexColor("#D8D4CB")
WHITE = colors.HexColor("#FFFFFF")
PALE_BLUE = colors.HexColor("#E8EEF1")


def register_fonts() -> None:
    for name, filename in (
        ("Body", "segoeui.ttf"),
        ("BodyBold", "segoeuib.ttf"),
        ("BodyItalic", "segoeuii.ttf"),
        ("Display", "georgia.ttf"),
        ("DisplayBold", "georgiab.ttf"),
    ):
        pdfmetrics.registerFont(TTFont(name, str(FONT_ROOT / filename)))
    pdfmetrics.registerFontFamily(
        "Body", normal="Body", bold="BodyBold", italic="BodyItalic",
        boldItalic="BodyBold",
    )


def markup(text: str) -> str:
    """Only lightweight bold emphasis is allowed in authored content."""
    if any(char in text for char in ("\u2011", "\u2013", "\u2014")):
        raise ValueError("Use ASCII hyphens in the handbook.")
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", escape(text))


def paragraph(text: str, size: float = 11, color=INK,
              leading: float | None = None) -> Paragraph:
    return Paragraph(markup(text), ParagraphStyle(
        "manual", fontName="Body", fontSize=size, leading=leading or size * 1.45,
        textColor=color, alignment=TA_LEFT, spaceAfter=0,
        allowWidows=0, allowOrphans=0,
    ))


class Page:
    def __init__(self, pdf: canvas.Canvas, number: int, section: str,
                 title: str, intro: str):
        self.c, self.number, self.y = pdf, number, H - 112
        pdf.setFillColor(CREAM)
        pdf.rect(0, 0, W, H, stroke=0, fill=1)
        pdf.bookmarkPage(f"p{number}")
        pdf.addOutlineEntry(title, f"p{number}", level=0)
        pdf.setFillColor(NAVY)
        pdf.setFont("DisplayBold", 20)
        pdf.drawString(M, H - 52, "TE")
        pdf.setFont("BodyBold", 8.5)
        pdf.drawString(M + 43, H - 45, "TEOREMA DA EDUCAÇÃO")
        pdf.setFont("Body", 8)
        pdf.setFillColor(MUTED)
        pdf.drawString(M + 43, H - 58, "MANUAL ADMINISTRATIVO")
        pdf.setStrokeColor(LINE)
        pdf.setLineWidth(0.6)
        pdf.line(M, H - 76, W - M, H - 76)
        self.label(section)
        title_paragraph = Paragraph(escape(title), ParagraphStyle(
            "heading", fontName="Display", fontSize=31, leading=37,
            textColor=NAVY,
        ))
        _, height = title_paragraph.wrap(CW, 160)
        title_paragraph.drawOn(pdf, M, self.y - height)
        self.y -= height + 12
        self.para(intro, color=MUTED, after=20)

    def require(self, height: float) -> None:
        if self.y - height < 70:
            raise ValueError(f"Page {self.number}: content exceeds safe area at {self.y:.1f}, height {height:.1f}")

    def label(self, text: str) -> None:
        self.require(19)
        self.c.setFillColor(GOLD)
        self.c.setFont("BodyBold", 8.8)
        self.c.drawString(M, self.y, text.upper())
        self.y -= 20

    def para(self, text: str, size: float = 11, color=INK, after: float = 12,
             x: float = M, width: float = CW) -> None:
        p = paragraph(text, size, color)
        _, height = p.wrap(width, H)
        self.require(height + after)
        p.drawOn(self.c, x, self.y - height)
        self.y -= height + after

    def heading(self, text: str) -> None:
        self.require(30)
        self.c.setFont("BodyBold", 13)
        self.c.setFillColor(NAVY)
        self.c.drawString(M, self.y - 13, text)
        self.y -= 30

    def step(self, number: str, title: str, text: str) -> None:
        p = paragraph(text, 10.8)
        _, height = p.wrap(CW - 43, H)
        total = max(32, height + 20) + 12
        self.require(total)
        self.c.setFillColor(NAVY)
        self.c.roundRect(M, self.y - 27, 27, 27, 5, fill=1, stroke=0)
        self.c.setFillColor(WHITE)
        self.c.setFont("BodyBold", 10)
        self.c.drawCentredString(M + 13.5, self.y - 18, number)
        self.c.setFillColor(NAVY)
        self.c.setFont("BodyBold", 12)
        self.c.drawString(M + 43, self.y - 12, title)
        p.drawOn(self.c, M + 43, self.y - 20 - height)
        self.y -= total

    def box(self, title: str, text: str, dark: bool = False) -> None:
        p = paragraph(text, 10.7, WHITE if dark else INK)
        _, height = p.wrap(CW - 34, H)
        total = height + 57
        self.require(total + 13)
        self.c.setFillColor(NAVY if dark else WHITE)
        self.c.roundRect(M, self.y - total, CW, total, 7, stroke=0, fill=1)
        self.c.setFillColor(LIGHT_GOLD if dark else GOLD)
        self.c.rect(M, self.y - total + 16, 3, total - 32, fill=1, stroke=0)
        self.c.setFont("BodyBold", 11)
        self.c.setFillColor(LIGHT_GOLD if dark else NAVY)
        self.c.drawString(M + 17, self.y - 25, title)
        p.drawOn(self.c, M + 17, self.y - 38 - height)
        self.y -= total + 13

    def table(self, headers: list[str], rows: list[list[str]],
              widths: list[float], size: float = 10.3) -> None:
        data = [[paragraph(h, 9, WHITE) for h in headers]]
        data += [[paragraph(cell, size) for cell in row] for row in rows]
        t = Table(data, colWidths=widths, hAlign="LEFT")
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, colors.HexColor("#EEECE6")]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
            ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("LINEBELOW", (0, 0), (-1, 0), 1, LIGHT_GOLD),
        ]))
        _, height = t.wrap(CW, H)
        self.require(height + 15)
        t.drawOn(self.c, M, self.y - height)
        self.y -= height + 15

    def check(self, text: str) -> None:
        p = paragraph(text, 10.6)
        _, height = p.wrap(CW - 24, H)
        self.require(height + 9)
        self.c.setStrokeColor(GOLD)
        self.c.setLineWidth(0.8)
        self.c.rect(M + 1, self.y - 12, 9, 9, stroke=1, fill=0)
        p.drawOn(self.c, M + 24, self.y - height)
        self.y -= height + 9

    def link(self, label: str, url: str) -> None:
        self.require(24)
        self.c.setFont("BodyBold", 10.5)
        self.c.setFillColor(NAVY)
        self.c.drawString(M, self.y - 11, label)
        link_width = pdfmetrics.stringWidth(label, "BodyBold", 10.5)
        self.c.linkURL(url, (M, self.y - 15, M + link_width, self.y + 1), relative=0)
        self.c.setStrokeColor(GOLD)
        self.c.setLineWidth(0.6)
        self.c.line(M, self.y - 16, M + link_width, self.y - 16)
        self.y -= 28

    def finish(self) -> None:
        self.c.setStrokeColor(LINE)
        self.c.line(M, 49, W - M, 49)
        self.c.setFont("Body", 8)
        self.c.setFillColor(MUTED)
        self.c.drawString(M, 30, "Teorema da Educação  /  Guia de operação")
        self.c.drawRightString(W - M, 30, f"{self.number:02d} / {PAGE_COUNT:02d}")
        print(f"Page {self.number:02d}: content bottom {self.y:.1f} pt")
        self.c.showPage()


def cover(pdf: canvas.Canvas) -> None:
    pdf.setFillColor(NAVY)
    pdf.rect(0, 0, W, H, stroke=0, fill=1)
    pdf.bookmarkPage("p1")
    pdf.addOutlineEntry("Manual administrativo", "p1", level=0)
    pdf.setStrokeColor(colors.HexColor("#21455B"))
    pdf.setLineWidth(0.55)
    for offset in range(-250, 460, 43):
        pdf.line(W - 245 + offset, H, W + offset, H - 245)
    pdf.setFillColor(LIGHT_GOLD)
    pdf.setFont("DisplayBold", 34)
    pdf.drawString(M, H - 80, "TE")
    pdf.setFont("BodyBold", 10)
    pdf.drawString(M, H - 108, "TEOREMA DA EDUCAÇÃO")
    pdf.setFont("Body", 9)
    pdf.setFillColor(colors.HexColor("#BAC9D0"))
    pdf.drawString(M, H - 128, "OPERAÇÃO DO PAINEL ADMINISTRATIVO")
    pdf.setStrokeColor(LIGHT_GOLD)
    pdf.setLineWidth(2)
    pdf.line(M, 514, M + 60, 514)
    pdf.setFillColor(WHITE)
    pdf.setFont("Display", 50)
    pdf.drawString(M, 445, "Manual")
    pdf.drawString(M, 382, "administrativo.")
    p = paragraph("Do primeiro material à liberação do aluno.\n", 17, LIGHT_GOLD, 24)
    _, h = p.wrap(CW - 30, 100)
    p.drawOn(pdf, M, 334 - h)
    p = paragraph("Um guia prático para cadastrar PDFs, organizar o catálogo, conferir pedidos e cuidar dos acessos com segurança.", 11.5, colors.HexColor("#D4DFE4"), 17)
    _, h = p.wrap(370, 100)
    p.drawOn(pdf, M, 264 - h)
    pdf.setStrokeColor(colors.HexColor("#385165"))
    pdf.setLineWidth(0.6)
    pdf.line(M, 114, W - M, 114)
    pdf.setFillColor(LIGHT_GOLD)
    pdf.setFont("BodyBold", 9)
    pdf.drawString(M, 88, "EDIÇÃO 01  /  " + EDITION)
    pdf.setFillColor(colors.HexColor("#BAC9D0"))
    pdf.setFont("Body", 9)
    pdf.drawString(M, 68, "Preparado por Code&Commerce")
    pdf.drawRightString(W - M, 68, "Uso interno da equipe")
    pdf.showPage()


def contents(pdf: canvas.Canvas) -> None:
    p = Page(pdf, 2, "Seu roteiro", "Encontre o que precisa.",
             "Leia em sequência para começar. No dia a dia, clique no assunto para ir direto à orientação.")
    entries = [
        (3, "Entrar no painel e navegar", "Acesso e usuários"),
        (4, "Cadastrar um novo material", "Nome, descrição e preço"),
        (5, "Enviar o PDF e a capa", "Formatos e validação"),
        (6, "Organizar o catálogo", "Publicar, atualizar e arquivar"),
        (7, "Localizar um pedido", "Compra pelo WhatsApp"),
        (8, "Conferir e liberar a compra", "Confirmação e cancelamento"),
        (9, "Gerenciar acessos", "Revogar e reliberar"),
        (10, "Acompanhar licenças", "Downloads e histórico"),
        (11, "Resolver imprevistos", "Retentativas seguras"),
        (12, "Seguir a rotina de operação", "Checklist final"),
    ]
    for number, title, hint in entries:
        p.require(37)
        pdf.setFillColor(NAVY)
        pdf.setFont("BodyBold", 11)
        pdf.drawString(M, p.y - 11, title)
        pdf.setFillColor(MUTED)
        pdf.setFont("Body", 9)
        pdf.drawString(M, p.y - 25, hint)
        pdf.setFillColor(GOLD)
        pdf.setFont("Display", 17)
        pdf.drawRightString(W - M, p.y - 17, f"{number:02d}")
        pdf.linkRect("", f"p{number}", (M, p.y - 29, W - M, p.y + 2), relative=0, thickness=0)
        pdf.setStrokeColor(LINE)
        pdf.setLineWidth(0.4)
        pdf.line(M, p.y - 34, W - M, p.y - 34)
        p.y -= 42
    p.y -= 7
    p.box("Disponibilidade dos recursos", "Este guia documenta as funções implementadas, não certifica a ativação comercial. Na edição atual, pedidos, acessos, biblioteca e licenças dependem da prévia técnica autorizada. Se uma aba não aparecer, consulte a Code&Commerce. **Publicar um produto não ativa o carrinho de produção.**")
    p.finish()


def access(pdf: canvas.Canvas) -> None:
    p = Page(pdf, 3, "01 / Acesso e navegação", "Sua central de operação.",
             "Entre com a conta administrativa autorizada. Uma conta comum de aluno não recebe acesso ao painel.")
    p.step("1", "Abra o endereço do painel", "Acesse **www.teoremadaeducacao.com.br/admin**. Se a sessão não estiver ativa, o site encaminhará você para o login.")
    p.step("2", "Faça login e escolha a área", "Use o e-mail e a senha da sua conta administrativa. Se aparecer **Acesso negado**, confira a conta e peça a revisão da permissão à equipe técnica.")
    p.table(["ÁREA", "PARA QUE SERVE"], [
        ["**Usuários**", "Consultar e-mail, CPF, telefone e data de cadastro. A lista é de consulta; não há edição ou exclusão de usuários nessa tela."],
        ["**Produtos**", "Criar materiais, enviar arquivos, atualizar versões e controlar a presença no catálogo."],
        ["**Pedidos e acessos**", "Conferir pedidos e decidir sobre a liberação dos materiais, quando o recurso estiver habilitado."],
        ["**Licenças de PDFs**", "Consultar licenças, downloads e decisões de revogação ou reativação, na prévia autorizada."],
    ], [145, CW - 145])
    p.para("Na navegação, **Meu perfil** abre sua conta e **Ver catálogo** abre a vitrine. Use **Anterior** e **Próxima** para percorrer as listas.", size=10.7)
    p.box("Proteja sua sessão", "Não compartilhe a senha nem envie dados de clientes em grupos. Ao terminar, use **Sair**, principalmente em computadores compartilhados.", dark=True)
    p.finish()


def material(pdf: canvas.Canvas) -> None:
    p = Page(pdf, 4, "02 / Produtos", "Prepare um novo material.",
             "Comece pelo cadastro. O rascunho permite preparar as informações antes de disponibilizar o PDF na vitrine.")
    p.step("1", "Clique em Novo material", "Na aba **Produtos**, abra um formulário limpo. Essa ação não apaga os materiais já cadastrados.")
    p.step("2", "Preencha os três campos", "Informe **Nome do material**, **Preço (R$)** e **Descrição**. Deixe claro o conteúdo, o público e o que o aluno receberá.")
    p.table(["CAMPO", "COMO PREENCHER"], [
        ["**Nome do material**", "De 2 a 120 caracteres. Exemplo fictício: Legislação educacional - revisão."],
        ["**Preço (R$)**", "Valor positivo, com até duas casas decimais. Confira o valor no cadastro antes de publicar."],
        ["**Descrição**", "De 10 a 2.000 caracteres. Explique temas, objetivos e edição. Evite prometer conteúdo que não está no PDF."],
    ], [145, CW - 145])
    p.step("3", "Salve em Criar rascunho", "Aguarde a mensagem de dados salvos. Só depois do cadastro será possível adicionar o PDF privado e a capa.")
    p.step("4", "Retome quando precisar", "Em **Seus materiais**, clique em **Gerenciar material**. Após alterar nome, descrição ou preço, use **Salvar alterações**.")
    p.box("Rascunho não é produto publicado", "Salvar as informações não coloca o material à venda. A publicação exige **PDF atual validado + capa validada + ação Publicar**.", dark=True)
    p.finish()


def upload(pdf: canvas.Canvas) -> None:
    p = Page(pdf, 5, "03 / Arquivos", "PDF privado. Capa pronta.",
             "Com o rascunho salvo, use Arquivos do material. Envie os dois arquivos separadamente e aguarde a validação de cada um.")
    p.step("1", "Envie o PDF", "Em **Tipo de envio**, escolha **PDF privado · até 20 MiB**. Preencha, se desejar, **Identificação da versão**, por exemplo: Edição revisada - outubro.")
    p.step("2", "Selecione e valide", "Clique em **Selecione o arquivo** e depois em **Enviar e validar PDF**. Aguarde o envio e a validação no servidor. Chegar a 100% não significa que a validação terminou.")
    p.step("3", "Envie a capa", "Escolha **Capa · até 5 MiB**, selecione a imagem e use **Enviar e validar capa**. O sistema otimiza a capa para WebP.")
    p.table(["ARQUIVO", "REQUISITOS"], [
        ["**PDF**", "Até 20 MiB. Documento estático, sem senha, scripts, anexos, formulários ou links externos."],
        ["**Capa**", "JPG/JPEG, PNG ou WebP estático, até 5 MiB. Use uma imagem nítida e legível também no celular."],
    ], [108, CW - 108])
    p.para("Confira o **PDF atual** e o **Histórico de versões**. A versão deve aparecer como validada. Se houver rejeição, revise o motivo e corrija o arquivo antes de tentar outro envio.", size=10.8)
    p.box("Se a conexão cair", "Consulte **Envios pendentes ou rejeitados** antes de reenviar. Se o arquivo já chegou, use **Tentar validar novamente**. Só cancele um envio que você decidiu abandonar. Consulte também a página 11.")
    p.finish()


def catalog(pdf: canvas.Canvas) -> None:
    p = Page(pdf, 6, "04 / Catálogo", "Publique com intenção.",
             "Escolha a ação correta para a vitrine. O estado do material é diferente do acesso que um comprador já recebeu.")
    p.table(["AÇÃO / ESTADO", "EFEITO NO MATERIAL"], [
        ["**Publicar / Publicado**", "Mostra o material no catálogo. O botão exige PDF atual e capa validados. Venda depende da habilitação comercial do ambiente."],
        ["**Despublicar / Despublicado**", "Retira o material da vitrine e impede novas compras. Mantém acessos anteriores; permite editar e publicar novamente."],
        ["**Arquivar / Arquivado**", "Impede novas vendas e novas edições/envios. Preserva arquivos, compras e acessos. Não há botão para desfazer o arquivamento nesta versão."],
    ], [145, CW - 145])
    p.heading("Como atualizar um PDF já existente")
    p.para("Abra **Gerenciar material**, envie o PDF revisado e aguarde a validação. O arquivo passa a ser a versão atual para compradores autorizados; versões anteriores e compras existentes são preservadas. Não crie um produto duplicado apenas para corrigir o PDF.")
    p.box("Arquivados fora da lista, não fora do histórico", "A listagem padrão oculta arquivados. Marque **Mostrar materiais arquivados** para consultá-los. Desmarcar a opção não apaga arquivos, pedidos ou licenças.")
    p.para("Antes de usar **Arquivar**, confirme se é um encerramento definitivo de edição. Se você quer apenas pausar a presença na vitrine, prefira **Despublicar**.", size=10.8)
    p.link("Conferir a vitrine de materiais", SITE + "/materiais")
    p.finish()


def order(pdf: canvas.Canvas) -> None:
    p = Page(pdf, 7, "05 / Pedidos e acessos", "Encontre a compra certa.",
             "Na prévia habilitada, o cliente monta um pedido no site e conversa com o Teorema pelo WhatsApp. A confirmação continua sendo administrativa.")
    p.label("Fluxo da compra / esquema do processo")
    p.table(["ETAPA", "O QUE ACONTECE"], [
        ["**01 / Escolha**", "O aluno seleciona os PDFs e revisa o carrinho."],
        ["**02 / Pedido**", "O site registra os materiais e valores e gera um código de pedido."],
        ["**03 / WhatsApp**", "O aluno abre a conversa com o resumo. Isso não comprova envio da mensagem nem pagamento."],
        ["**04 / Conferência**", "O administrador verifica o pagamento fora do site e confere o pedido."],
        ["**05 / Liberação**", "A confirmação administrativa libera todos os materiais do pedido para a conta correta."],
    ], [131, CW - 131])
    p.heading("Buscar no painel")
    p.para("Abra **Pedidos e acessos > Pedidos**. Use **Código do pedido**, **E-mail do cliente**, **Status do pedido** e, se necessário, **Data inicial / Data final**. Clique em **Buscar**. O filtro de e-mail exige o endereço completo.")
    p.para("No cartão encontrado, escolha **Ver pedido**. Confira o código, o e-mail, os materiais e o total registrado. O preço do pedido é histórico: mudar o catálogo não altera uma compra já registrada.", size=10.8)
    p.box("Nunca libere apenas por uma mensagem", "Confirme que a pessoa está tratando do pedido certo e que o pagamento foi efetivamente conferido. O pedido começa como **Aguardando confirmação**; ele não é um comprovante.", dark=True)
    p.finish()


def confirmation(pdf: canvas.Canvas) -> None:
    p = Page(pdf, 8, "06 / Decisão administrativa", "Conferir. Confirmar. Liberar.",
             "Só um pedido Aguardando confirmação oferece as ações de confirmação ou cancelamento. A liberação acontece para todos os PDFs juntos.")
    p.step("1", "Revise antes de decidir", "Confira **código do pedido, conta do cliente, lista de materiais e total**. Verifique o pagamento no canal usado pela operação. Não use apenas a declaração do cliente como comprovação.")
    p.step("2", "Confirme a compra", "Clique em **Confirmar compra e liberar materiais** e leia a revisão. Marque a declaração de conferência do pagamento e confirme a ação.")
    p.box("Declaração exibida no painel", "“Conferi o pagamento fora do site e os dados deste pedido. Liberar todos os materiais para esta conta.”")
    p.step("3", "Verifique o resultado", "O pedido deve aparecer como **Compra confirmada**. Confira os acessos aos itens e o **Histórico deste pedido**. Na biblioteca habilitada, o cliente consulta os materiais liberados com a mesma conta.")
    p.heading("Se o pedido não deve ser confirmado")
    p.para("Use **Cancelar pedido** enquanto ele estiver pendente. Informe um **Motivo** claro, de 5 a 1.000 caracteres, e confirme. O resultado será **Pedido cancelado**, sem liberação de materiais.", size=10.8)
    p.box("Cancelamento não é estorno", "O painel não desfaz um pagamento no banco ou em outro canal. Eventual devolução financeira deve ser tratada separadamente. Uma compra já confirmada é gerenciada por acessos e licenças, não por esse cancelamento.", dark=True)
    p.finish()


def grants(pdf: canvas.Canvas) -> None:
    p = Page(pdf, 9, "07 / Acessos", "Controle o direito ao material.",
             "O acesso registra a autorização de uma compra para um material. Consulte a origem e o histórico antes de mudar esse direito.")
    p.step("1", "Localize a autorização", "Em **Pedidos e acessos > Acessos**, filtre por **E-mail do cliente** completo e **Estado do acesso**. Abra **Ver origem e histórico** para conferir pedido e material.")
    p.step("2", "Revogue quando necessário", "Para um acesso ativo, escolha **Revogar acesso**. Informe um motivo objetivo e confirme. A decisão afeta a autorização daquela origem de compra.")
    p.step("3", "Relibere após a revisão", "Para um acesso revogado, escolha **Reliberar acesso**. Informe o motivo e confirme. Consulte o estado final e o histórico para verificar a conclusão.")
    p.table(["AÇÃO", "NÃO CONFUNDIR COM"], [
        ["**Despublicar / Arquivar**", "Controlar novas vendas e catálogo. Essas ações não revogam compras anteriores."],
        ["**Revogar acesso**", "Remover a autorização daquele pedido/material. Outra compra ativa pode manter o aluno autorizado."],
        ["**Revogar licença**", "Bloquear novos downloads pela licença daquela origem. Não invalida PDFs que já foram salvos."],
    ], [151, CW - 151])
    p.box("Acesso e licença têm estados próprios", "Reliberar um acesso não deve ser confundido com reativar uma licença. Se o download seguir bloqueado, confira também **Licenças de PDFs**. Reativar a licença exige compra e acesso válidos.")
    p.finish()


def licenses(pdf: canvas.Canvas) -> None:
    p = Page(pdf, 10, "08 / Licenças de PDFs", "Rastreabilidade por compra.",
             "A licença é criada no primeiro preparo autorizado do material. Uma compra confirmada pode ainda não ter licença se o aluno nunca iniciou o download.")
    p.step("1", "Busque a licença", "Abra **Licenças de PDFs**. Filtre por **E-mail do cliente**, **Código da licença** ou **Estado da licença**, e clique em **Buscar licenças**.")
    p.step("2", "Confira os dados e eventos", "Revise produto, cliente, pedido, código e estado. **Ver histórico** mostra licença criada, preparo iniciado, PDF autorizado, falhas e decisões administrativas.")
    p.step("3", "Revogue ou reative", "Escolha **Revogar licença** ou **Reativar licença**, preencha **Motivo da decisão** (5 a 1.000 caracteres) e use **Confirmar decisão**. Reativar preserva o código e o contador acumulado.")
    p.box("O que o contador representa", "A quantidade indica **PDFs personalizados autorizados para envio**, não a certeza de que o aluno salvou, leu ou abriu o arquivo. O painel mostra também a data do último download autorizado.")
    p.para("O mesmo código é reutilizado nos downloads da mesma compra/material. O original fica privado; o aluno recebe a cópia personalizada. Revogação bloqueia novos downloads dessa origem, mas não apaga cópias já baixadas.", size=10.8)
    p.heading("Limite opcional de downloads")
    p.para("O painel informa o limite configurado. **0 significa sem limite automático.** A alteração é técnica, no servidor, e não possui um campo de edição nessa tela. Peça à Code&Commerce a revisão da configuração; reativar uma licença não zera o contador.", size=10.8)
    p.finish()


def troubleshooting(pdf: canvas.Canvas) -> None:
    p = Page(pdf, 11, "09 / Imprevistos", "Consulte antes de repetir.",
             "Uma resposta perdida não prova que a operação falhou. Primeiro verifique o estado e o histórico; depois escolha a ação segura.")
    p.table(["SITUAÇÃO", "PRÓXIMO PASSO SEGURO"], [
        ["**Aba não aparece ou operação indisponível**", "Confira sessão e ambiente com a equipe técnica. Não altere permissões, chaves ou travas comerciais como atalho."],
        ["**Publicar está desabilitado**", "Verifique se há PDF atual e capa validados e se o material já está publicado ou arquivado."],
        ["**Upload interrompido**", "Abra o material e consulte os envios pendentes. Use Tentar validar novamente se o arquivo já chegou. Evite reenviar sem consultar."],
        ["**PDF rejeitado**", "Leia o motivo. Reexporte um PDF estático dentro do limite e sem os elementos proibidos. Não force a validação."],
        ["**Decisão de pedido pendente**", "Use Consultar pedido pendente e Recuperar tentativa. Recupere a operação original; não crie outra decisão às cegas."],
        ["**Decisão de licença pendente**", "Use Consultar histórico pendente e Recuperar decisão da licença. Se a tentativa não puder ser lida, procure suporte antes de limpar dados do navegador."],
        ["**Cliente não consegue baixar**", "Confira conta, pedido confirmado, acesso, licença e limite. Se o site pedir, oriente o aluno a completar seu nome em Meu perfil."],
    ], [158, CW - 158], size=10)
    p.box("Limpeza de envios não é exclusão de materiais", "**Limpar envios expirados** remove temporários e arquivos rejeitados elegíveis com mais de 48 horas. PDFs e capas validados e o histórico são preservados. Leia a confirmação antes de executar.")
    p.finish()


def routine(pdf: canvas.Canvas) -> None:
    p = Page(pdf, 12, "10 / Rotina da equipe", "Uma operação consistente.",
             "Use este checklist para publicar com qualidade, liberar a compra correta e encerrar o atendimento com um histórico confiável.")
    p.heading("Antes de publicar")
    for text in (
        "Nome, descrição e preço revisados; conteúdo correspondente à oferta.",
        "PDF atual validado, versão identificada e capa legível.",
        "Ação Publicar concluída e apresentação conferida em Ver catálogo.",
    ):
        p.check(text)
    p.y -= 8
    p.heading("Antes e depois de confirmar uma compra")
    for text in (
        "Pedido, e-mail do cliente, materiais e total conferidos.",
        "Pagamento externo verificado antes de marcar a declaração.",
        "Estado Compra confirmada, acessos e histórico verificados.",
        "Cliente orientado a entrar na conta usada no pedido; nunca compartilhar o PDF original.",
    ):
        p.check(text)
    p.y -= 8
    p.heading("Ao encerrar o expediente")
    for text in (
        "Revisar respostas pendentes e recuperar as tentativas originais.",
        "Registrar motivos claros para revogações, reativações e cancelamentos.",
        "Encerrar a sessão com Sair; manter senhas e dados de clientes privados.",
    ):
        p.check(text)
    p.box("Escopo deste manual", "O painel do site gerencia os PDFs daqui. Cursos da Hotmart têm administração externa. Configuração de domínio, e-mail, backups, limites e habilitação comercial são tarefas técnicas, não ações deste guia.")
    p.para("**Edição 01 - " + EDITION + ".** Conteúdo conferido nas telas e regras do projeto. Nenhuma compra, permissão ou configuração foi alterada para produzir este manual. Preparado por **Code&Commerce**. Atualize o guia quando os botões ou fluxos mudarem.", size=9.2, color=MUTED, after=0)
    p.finish()


def main() -> None:
    register_fonts()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(OUTPUT), pagesize=A4, pageCompression=1, invariant=1)
    pdf.setTitle("Manual administrativo | Teorema da Educação")
    pdf.setAuthor("Code&Commerce")
    pdf.setSubject("Guia de uso do painel: materiais, pedidos, acessos e licenças de PDFs")
    pdf.setKeywords("Teorema da Educação, manual administrativo, PDFs, catálogo, licenças")
    pdf.setCreator("Code&Commerce / ReportLab")
    pdf.showOutline()
    for render in (cover, contents, access, material, upload, catalog, order,
                   confirmation, grants, licenses, troubleshooting, routine):
        render(pdf)
    pdf.save()

    from pypdf import PdfReader

    reader = PdfReader(OUTPUT)
    if len(reader.pages) != PAGE_COUNT:
        raise ValueError("Unexpected page count")
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    for expected in (
        "Code&Commerce", "Mostrar materiais arquivados", "Recuperar tentativa",
        "Confirmar compra e liberar materiais", "Enviar e validar PDF",
        "Licenças de PDFs",
    ):
        if expected not in text:
            raise ValueError(f"Missing handbook text: {expected}")
    if "\ufffd" in text or "\u25a0" in text:
        raise ValueError("Replacement glyph in generated document")
    print(f"Validated {len(reader.pages)} pages; {len(text.split())} words")
    print(OUTPUT)


if __name__ == "__main__":
    main()
