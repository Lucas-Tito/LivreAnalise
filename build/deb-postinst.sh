#!/bin/bash

# ATENCAO: o deb.afterInstall SUBSTITUI o postinst do template, nao complementa.
# Tudo que o template fazia precisa continuar aqui -- em especial o bloco
# update-alternatives abaixo, que cria o /usr/bin/livreanalise. Remover aquele
# bloco faz o comando de terminal desaparecer sem nenhum erro aparecer.
#
# Este postinst substitui o gerado pelo electron-builder. O template dele decide
# o modo do chrome-sandbox em tempo de instalacao, testando user namespaces como
# root:
#
#   if ! { [[ -L /proc/self/ns/user ]] && unshare --user true; }; then
#       chmod 4755 chrome-sandbox   # sem namespaces
#   else
#       chmod 0755 chrome-sandbox   # com namespaces
#   fi
#
# Quando esse palpite erra -- ou quando o postinst nao roda -- o arquivo fica
# 0755 e o Chromium aborta com "The SUID sandbox helper binary was found, but is
# not configured correctly".
#
# O SUID e aplicado sempre, como fazem os pacotes do Chrome, do VS Code e do
# Slack: com user namespaces disponiveis o Chromium os prefere e ignora o
# helper; sem eles, cai no helper, que agora esta correto.

if type update-alternatives 2>/dev/null >&1; then
    if [ -L '/usr/bin/livreanalise' -a -e '/usr/bin/livreanalise' -a "`readlink '/usr/bin/livreanalise'`" != '/etc/alternatives/livreanalise' ]; then
        rm -f '/usr/bin/livreanalise'
    fi
    update-alternatives --install '/usr/bin/livreanalise' 'livreanalise' '/opt/LivreAnalise/livreanalise' 100 || ln -sf '/opt/LivreAnalise/livreanalise' '/usr/bin/livreanalise'
else
    ln -sf '/opt/LivreAnalise/livreanalise' '/usr/bin/livreanalise'
fi

# Estas duas linhas sao o motivo deste arquivo existir: sem elas o app nao abre
# no Ubuntu. Ver issue #32.
chown root:root '/opt/LivreAnalise/chrome-sandbox' || true
chmod 4755 '/opt/LivreAnalise/chrome-sandbox' || true

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi
