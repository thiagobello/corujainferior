import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { mensagemErro, supabase } from '@/lib/supabase';
import { ESPACO, useCores } from '@/lib/tema';
import { Aviso, Botao, Campo, Cartao, T, Tela } from './ui';

export function Login() {
  const c = useCores();
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function enviar() {
    setErro(null);
    setInfo(null);
    if (!email.trim() || senha.length < 6) {
      setErro('Informe e-mail e senha (mín. 6 caracteres).');
      return;
    }
    setCarregando(true);
    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: senha,
          options: { data: { nome: nome.trim() } },
        });
        if (error) throw error;
        if (!data.session) setInfo('Conta criada. Confirme o e-mail e entre.');
      }
    } catch (e) {
      const msg = mensagemErro(e);
      setErro(/Invalid login/i.test(msg) ? 'E-mail ou senha incorretos.' : msg);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Tela bordas={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ maxWidth: 420, width: '100%', alignSelf: 'center', gap: ESPACO.lg, marginTop: ESPACO.xl * 2 }}>
          <View style={{ gap: 4 }}>
            <T v="titulo" estilo={{ fontSize: 26 }}>Coruja Inferior</T>
            <T v="legenda">Estoque, vendas e financeiro</T>
          </View>
          <Cartao estilo={{ gap: ESPACO.md }}>
            {modo === 'criar' && <Campo rotulo="Nome" value={nome} onChangeText={setNome} autoComplete="name" />}
            <Campo
              rotulo="E-mail"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <Campo
              rotulo="Senha"
              value={senha}
              onChangeText={setSenha}
              secureTextEntry
              autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
              onSubmitEditing={enviar}
            />
            {erro && <Aviso tipo="perigo" texto={erro} />}
            {info && <Aviso tipo="sucesso" texto={info} />}
            <Botao titulo={modo === 'entrar' ? 'Entrar' : 'Criar conta'} onPress={enviar} carregando={carregando} />
          </Cartao>
          <Botao
            v="fantasma"
            titulo={modo === 'entrar' ? 'Primeiro acesso? Criar conta' : 'Já tenho conta'}
            onPress={() => setModo(modo === 'entrar' ? 'criar' : 'entrar')}
          />
          {modo === 'criar' && (
            <T v="legenda" cor={c.texto2} estilo={{ textAlign: 'center' }}>
              A primeira conta vira administradora.
            </T>
          )}
        </View>
      </KeyboardAvoidingView>
    </Tela>
  );
}
