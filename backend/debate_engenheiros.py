from openai import OpenAI
from fastmcp import FastMCP

# Conecta ao seu Ollama local
cliente = OpenAI(base_url="http://localhost:11434/v1", api_key="local")

# Cria o servidor MCP para o Antigravity
mcp = FastMCP("Auditoria_Engenharia_Local")

def chamar_modelo(modelo: str, system_prompt: str, user_prompt: str) -> str:
    """Função auxiliar para chamar o Ollama"""
    resposta = cliente.chat.completions.create(
        model=modelo,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        temperature=0.2 # Baixa criatividade, alta precisão lógica
    )
    return resposta.choices[0].message.content

@mcp.tool()
def auditar_e_corrigir_codigo(tarefa: str, codigo_atual: str) -> str:
    """
    Submete o código a um debate entre Qwen e DeepSeek. 
    Retorna uma explicação curta e o código corrigido.
    """
    # ETAPA 1: Qwen gera o primeiro rascunho
    prompt_draft = f"Contexto atual do arquivo:\n{codigo_atual}\n\nTarefa: {tarefa}"
    rascunho_qwen = chamar_modelo(
        "qwen2.5-coder:14b",
        "Você é um engenheiro de software sênior. Escreva ou modifique o código focado em cálculos precisos.",
        prompt_draft
    )

    # ETAPA 2: DeepSeek atua como Auditor
    prompt_critica = f"Código original:\n{codigo_atual}\n\nRascunho gerado:\n{rascunho_qwen}\n\nAnalise este código em busca de erros de lógica, matemática ou engenharia estrutural. Aponte apenas as falhas."
    critica_deepseek = chamar_modelo(
        "deepseek-coder-v2",
        "Você é um auditor rigoroso de engenharia. Revise o código, encontre falhas de cálculo, lógica ou performance e liste os problemas de forma direta.",
        prompt_critica
    )

    # ETAPA 3: Qwen refina e dá o veredito final (Formato exigido por você)
    prompt_final = f"Tarefa original: {tarefa}\n\nCrítica do Auditor:\n{critica_deepseek}\n\nRascunho anterior:\n{rascunho_qwen}\n\nCorrija as falhas e gere o resultado final."
    resultado_final = chamar_modelo(
        "qwen2.5-coder:14b",
        "Você deve corrigir o código baseado na crítica. Retorne APENAS duas coisas: 1) Um parágrafo curto de 2 ou 3 frases explicando as mudanças. 2) O bloco de código corrigido puro, pronto para ser inserido.",
        prompt_final
    )

    return resultado_final

if __name__ == "__main__":
    mcp.run()