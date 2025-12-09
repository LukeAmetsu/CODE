package pcalc;

import java.util.ArrayList;
import java.util.List;
import pcalc.calcula.AlphaB;

/* loaded from: CalculaEsforcos.class */
public class CalculaEsforcos {

    /* renamed from: dados, reason: collision with root package name */
    private Dados f0dados;
    private int n;
    private int tipoVinculacao;
    private boolean limMb;
    private double l;
    private double lFlamb;
    private double eci;
    private double ix;
    private double iy;
    private double gamaF;
    private double ac;
    private double fcd;
    private int nItMax = 100;
    private double coefF = 0.0d;
    private double psiN = 0.0d;
    private double psiM = 0.0d;

    public CalculaEsforcos(Dados dados2) {
        this.n = 3;
        this.eci = 0.0d;
        this.ix = 0.0d;
        this.iy = 0.0d;
        this.gamaF = 0.0d;
        this.ac = 0.0d;
        this.fcd = 0.0d;
        this.f0dados = dados2;
        List<double[]> esforcos = dados2.esforcos.getListaEsforcos();
        this.tipoVinculacao = dados2.secao.getTipoVinculacao();
        this.gamaF = dados2.config.getGamaF();
        double hx = dados2.secao.getHx() / 100.0d;
        double hy = dados2.secao.getHy() / 100.0d;
        this.ac = dados2.secao.getAreaAc();
        this.fcd = dados2.config.getFck() / dados2.config.getGamaC();
        this.l = dados2.secao.getL() / 100.0d;
        if (this.tipoVinculacao == 1) {
            this.lFlamb = this.l * 100.0d;
        }
        if (this.tipoVinculacao == 2) {
            this.lFlamb = 2.0d * this.l * 100.0d;
        }
        this.eci = (5600.0d * Math.sqrt(dados2.config.getFck() * 100.0d)) / 100.0d;
        this.ix = dados2.secao.getIX();
        this.iy = dados2.secao.getIY();
        this.limMb = dados2.config.getLimMb();
        List<Double> nsd = new ArrayList<>();
        List<double[]> msxd = new ArrayList<>();
        List<double[]> msyd = new ArrayList<>();
        List<double[]> msxd2 = new ArrayList<>();
        List<double[]> msyd2 = new ArrayList<>();
        List<double[]> msdMin = new ArrayList<>();
        double msxMin = 0.0d;
        double msyMin = 0.0d;
        double msx2Min = 0.0d;
        double msy2Min = 0.0d;
        if ((dados2.config.getMetodoSegOrd() == 4) | (dados2.config.getMetodoSegOrd() == 5)) {
            this.n = 11;
        }
        double lambX = dados2.secao.getLambdaX();
        double lambY = dados2.secao.getLambdaY();
        for (int i = 0; i < esforcos.size(); i++) {
            double nsdI = this.gamaF * esforcos.get(i)[0];
            nsd.add(Double.valueOf(nsdI));
            if (this.tipoVinculacao == 0) {
                msxd.add(new double[]{this.gamaF * esforcos.get(i)[1]});
                msyd.add(new double[]{this.gamaF * esforcos.get(i)[2]});
                msxd2.add(msxd.get(i));
                msyd2.add(msyd.get(i));
                if (dados2.config.getLimMomentoMin()) {
                    double dAbs = Math.abs(nsdI * (0.015d + (0.03d * hy)));
                    msxMin = dAbs;
                    msx2Min = dAbs;
                    double dAbs2 = Math.abs(nsdI * (0.015d + (0.03d * hx)));
                    msyMin = dAbs2;
                    msy2Min = dAbs2;
                }
            }
            if (this.tipoVinculacao != 0) {
                if (dados2.erros.getListaErroNrd(i) == null) {
                    double msxdTopoI = this.gamaF * esforcos.get(i)[1];
                    double msxdBaseI = this.gamaF * esforcos.get(i)[3];
                    msxd.add(calculaMomento1Ord(msxdTopoI, msxdBaseI));
                    if ((dados2.config.getCalcular2ord() == 1) & (nsdI < 0.0d) & (dados2.config.getMetodoSegOrd() != 5)) {
                        if (dados2.config.getMetodoSegOrd() == 1) {
                            msxd2.add(calculaMomento2OrdP1(nsdI, hy, msxd.get(i)));
                        }
                        if (dados2.config.getMetodoSegOrd() == 2) {
                            msxd2.add(calculaMomento2OrdP2(nsdI, hy, msxd.get(i)));
                        }
                        if (dados2.config.getMetodoSegOrd() == 3) {
                            msxd2.add(calculaMomento2OrdP3(nsdI, hy, msxd.get(i), i, "x", lambX));
                        }
                        if (dados2.config.getMetodoSegOrd() == 4) {
                            msxd2.add(calculaMomento2OrdP4(nsdI, msxdTopoI, msxdBaseI, "x", i, "m"));
                        }
                    }
                    if ((dados2.config.getCalcular2ord() == 2) & (nsdI < 0.0d) & (dados2.config.getMetodoSegOrd() != 5)) {
                        double alphaB = new AlphaB(Integer.valueOf(this.tipoVinculacao), Double.valueOf(msxdTopoI), Double.valueOf(msxdBaseI)).getAlphaB().doubleValue();
                        double e1 = Math.max(Math.abs(msxdTopoI), Math.abs(msxdBaseI)) / Math.abs(nsdI);
                        if (lambX >= Math.round(Math.min(90.0d, Math.max(35.0d, (25.0d + ((12.5d * e1) / hy)) / alphaB)))) {
                            if (dados2.config.getMetodoSegOrd() == 1) {
                                msxd2.add(calculaMomento2OrdP1(nsdI, hy, msxd.get(i)));
                            }
                            if (dados2.config.getMetodoSegOrd() == 2) {
                                msxd2.add(calculaMomento2OrdP2(nsdI, hy, msxd.get(i)));
                            }
                            if (dados2.config.getMetodoSegOrd() == 3) {
                                msxd2.add(calculaMomento2OrdP3(nsdI, hy, msxd.get(i), i, "x", lambX));
                            }
                            if (dados2.config.getMetodoSegOrd() == 4) {
                                msxd2.add(calculaMomento2OrdP4(nsdI, msxdTopoI, msxdBaseI, "x", i, "m"));
                            }
                        } else {
                            msxd2.add(msxd.get(i));
                        }
                    }
                    if ((dados2.config.getCalcular2ord() == 3) | (nsdI >= 0.0d)) {
                        msxd2.add(msxd.get(i));
                    }
                    double msydTopoI = this.gamaF * (-esforcos.get(i)[2]);
                    double msydBaseI = this.gamaF * (-esforcos.get(i)[4]);
                    if ((dados2.config.getConsiderarFluencia() == 0) & (nsdI < 0.0d)) {
                        if (Math.abs(msydTopoI) > Math.abs(msydBaseI)) {
                            double mdF = calculaMomentoF(nsdI, msydTopoI, "y");
                            msydTopoI += mdF;
                            msydBaseI -= mdF;
                        } else {
                            double mdF2 = calculaMomentoF(nsdI, msydBaseI, "y");
                            msydTopoI -= mdF2;
                            msydBaseI += mdF2;
                        }
                    }
                    msyd.add(calculaMomento1Ord(msydTopoI, msydBaseI));
                    if ((dados2.config.getCalcular2ord() == 1) & (nsdI < 0.0d) & (dados2.config.getMetodoSegOrd() != 5)) {
                        if (dados2.config.getMetodoSegOrd() == 1) {
                            msyd2.add(calculaMomento2OrdP1(nsdI, hx, msyd.get(i)));
                        }
                        if (dados2.config.getMetodoSegOrd() == 2) {
                            msyd2.add(calculaMomento2OrdP2(nsdI, hx, msyd.get(i)));
                        }
                        if (dados2.config.getMetodoSegOrd() == 3) {
                            msyd2.add(calculaMomento2OrdP3(nsdI, hx, msyd.get(i), i, "y", lambY));
                        }
                        if (dados2.config.getMetodoSegOrd() == 4) {
                            msyd2.add(calculaMomento2OrdP4(nsdI, msydTopoI, msydBaseI, "y", i, "m"));
                        }
                    }
                    if ((dados2.config.getCalcular2ord() == 2) & (nsdI < 0.0d) & (dados2.config.getMetodoSegOrd() != 5)) {
                        double alphaB2 = new AlphaB(Integer.valueOf(this.tipoVinculacao), Double.valueOf(msydTopoI), Double.valueOf(msydBaseI)).getAlphaB().doubleValue();
                        double e12 = Math.max(Math.abs(msydTopoI), Math.abs(msydBaseI)) / Math.abs(nsdI);
                        if (lambY >= Math.round(Math.min(90.0d, Math.max(35.0d, (25.0d + ((12.5d * e12) / hx)) / alphaB2)))) {
                            if (dados2.config.getMetodoSegOrd() == 1) {
                                msyd2.add(calculaMomento2OrdP1(nsdI, hx, msyd.get(i)));
                            }
                            if (dados2.config.getMetodoSegOrd() == 2) {
                                msyd2.add(calculaMomento2OrdP2(nsdI, hx, msyd.get(i)));
                            }
                            if (dados2.config.getMetodoSegOrd() == 3) {
                                msyd2.add(calculaMomento2OrdP3(nsdI, hx, msyd.get(i), i, "y", lambY));
                            }
                            if (dados2.config.getMetodoSegOrd() == 4) {
                                msyd2.add(calculaMomento2OrdP4(nsdI, msydTopoI, msydBaseI, "y", i, "m"));
                            }
                        } else {
                            msyd2.add(msyd.get(i));
                        }
                    }
                    if ((dados2.config.getCalcular2ord() == 3) | (nsdI >= 0.0d)) {
                        msyd2.add(msyd.get(i));
                    }
                    if (dados2.config.getMetodoSegOrd() == 5) {
                        if ((dados2.config.getCalcular2ord() == 1) & (nsdI < 0.0d)) {
                            double[][] msd2 = calculaMomento2OrdP5(nsdI, msxdTopoI, msxdBaseI, msydTopoI, msydBaseI, i, "m", true, true);
                            msxd2.add(msd2[0]);
                            msyd2.add(msd2[1]);
                        }
                        if ((dados2.config.getCalcular2ord() == 2) & (nsdI < 0.0d)) {
                            boolean cal2ordX = true;
                            double alphaBX = new AlphaB(Integer.valueOf(this.tipoVinculacao), Double.valueOf(msxdTopoI), Double.valueOf(msxdBaseI)).getAlphaB().doubleValue();
                            double e1X = Math.max(Math.abs(msxdTopoI), Math.abs(msxdBaseI)) / Math.abs(nsdI);
                            double lamb1X = Math.round(Math.min(90.0d, Math.max(35.0d, (25.0d + ((12.5d * e1X) / hy)) / alphaBX)));
                            cal2ordX = lambX < lamb1X ? false : cal2ordX;
                            boolean cal2ordY = true;
                            double alphaBY = new AlphaB(Integer.valueOf(this.tipoVinculacao), Double.valueOf(msydTopoI), Double.valueOf(msydBaseI)).getAlphaB().doubleValue();
                            double e1Y = Math.max(Math.abs(msydTopoI), Math.abs(msydBaseI)) / Math.abs(nsdI);
                            double lamb1Y = Math.round(Math.min(90.0d, Math.max(35.0d, (25.0d + ((12.5d * e1Y) / hx)) / alphaBY)));
                            double[][] msd22 = calculaMomento2OrdP5(nsdI, msxdTopoI, msxdBaseI, msydTopoI, msydBaseI, i, "m", cal2ordX, lambY < lamb1Y ? false : cal2ordY);
                            msxd2.add(msd22[0]);
                            msyd2.add(msd22[1]);
                        }
                    }
                    if (dados2.config.getLimMomentoMin()) {
                        double d = 0.03d * hy;
                        msxMin = d;
                        msx2Min = Math.abs(nsdI * (0.015d + d));
                        double d2 = 0.03d * hx;
                        msyMin = d2;
                        msy2Min = Math.abs(nsdI * (0.015d + d2));
                        if ((dados2.config.getCalcular2ord() != 3) & (nsdI < 0.0d)) {
                            double e13 = Math.max(Math.abs(msxdTopoI), Math.abs(msxdBaseI)) / Math.abs(nsdI);
                            double lamb1 = Math.min(90.0d, Math.max(35.0d, (25.0d + ((12.5d * e13) / hy)) / 1.0d));
                            if ((lambX > lamb1) | (dados2.config.getCalcular2ord() == 1)) {
                                msx2Min = dados2.config.getMetodoSegOrd() == 3 ? calculaMomento2OrdP3(nsdI, hy, new double[]{msxMin, msxMin, msxMin}, i, "x", lambX)[1] : dados2.config.getMetodoSegOrd() == 2 ? calculaMomento2OrdP2(nsdI, hy, new double[]{msxMin, msxMin, msxMin})[1] : dados2.config.getMetodoSegOrd() == 1 ? calculaMomento2OrdP1(nsdI, hy, new double[]{msxMin, msxMin, msxMin})[1] : msx2Min;
                                if (dados2.config.getMetodoSegOrd() == 4) {
                                    for (double d3 : calculaMomento2OrdP4(nsdI, msxMin, -msxMin, "x", i, "mMin")) {
                                        msx2Min = Math.max(msx2Min, Math.abs(d3));
                                    }
                                }
                                if (dados2.config.getMetodoSegOrd() == 5) {
                                    double[] msx2MinArray = calculaMomento2OrdP5(nsdI, msxMin, -msxMin, 0.0d, 0.0d, i, "mMin", true, false)[0];
                                    for (double d4 : msx2MinArray) {
                                        msx2Min = Math.max(msx2Min, Math.abs(d4));
                                    }
                                }
                            }
                            if ((lambY > lamb1) | (dados2.config.getCalcular2ord() == 1)) {
                                msy2Min = dados2.config.getMetodoSegOrd() == 3 ? calculaMomento2OrdP3(nsdI, hx, new double[]{msyMin, msyMin, msyMin}, i, "y", lambY)[1] : dados2.config.getMetodoSegOrd() == 2 ? calculaMomento2OrdP2(nsdI, hx, new double[]{msyMin, msyMin, msyMin})[1] : dados2.config.getMetodoSegOrd() == 1 ? calculaMomento2OrdP1(nsdI, hx, new double[]{msyMin, msyMin, msyMin})[1] : msy2Min;
                                if (dados2.config.getMetodoSegOrd() == 4) {
                                    for (double d5 : calculaMomento2OrdP4(nsdI, msyMin, -msyMin, "y", i, "mMin")) {
                                        msy2Min = Math.max(msy2Min, Math.abs(d5));
                                    }
                                }
                                if (dados2.config.getMetodoSegOrd() == 5) {
                                    double[] msy2MinArray = calculaMomento2OrdP5(nsdI, 0.0d, 0.0d, msyMin, -msyMin, i, "mMin", false, true)[1];
                                    for (double d6 : msy2MinArray) {
                                        msy2Min = Math.max(msy2Min, Math.abs(d6));
                                    }
                                }
                            }
                        }
                    }
                } else {
                    msxd.add(null);
                    msxd2.add(null);
                    msyd.add(null);
                    msyd2.add(null);
                }
            }
            msdMin.add(new double[]{msxMin, msyMin, msx2Min, msy2Min, 0.0d});
        }
        dados2.resultados.setEsforcos(new Object[]{nsd, msxd, msyd, msxd2, msyd2, null, null});
        dados2.resultados.setMomentoMin(msdMin);
    }

    private double calculaMomentoF(double nsd, double md, String eixo) {
        double ne = 0.0d;
        double nsg = Math.abs((this.psiN * nsd) / this.gamaF);
        double msg = (this.psiM * md) / this.gamaF;
        if ("x".equals(eixo)) {
            ne = ((10.0d * this.eci) * this.iy) / Math.pow(this.lFlamb, 2.0d);
        }
        if ("y".equals(eixo)) {
            ne = ((10.0d * this.eci) * this.ix) / Math.pow(this.lFlamb, 2.0d);
        }
        double mdF = Math.abs(nsd) * (msg / nsg) * (Math.pow(2.718281828459045d, this.coefF / (ne - nsg)) - 1.0d);
        return mdF;
    }

    private double[] calculaMomento1Ord(double mdTopo, double mdBase) {
        double[] md = new double[this.n];
        if ((this.f0dados.config.getMetodoSegOrd() == 4) | (this.f0dados.config.getMetodoSegOrd() == 5)) {
            if (this.tipoVinculacao == 1) {
                if (this.limMb & ((-mdBase) * mdTopo < 0.0d)) {
                    if (Math.abs(mdBase) < Math.abs(mdTopo)) {
                        if ((-Math.abs(mdBase)) < (-0.5d) * Math.abs(mdTopo)) {
                            mdBase = 0.5d * mdTopo;
                        }
                    } else if ((-Math.abs(mdTopo)) < (-0.5d) * Math.abs(mdBase)) {
                        mdTopo = 0.5d * mdBase;
                    }
                }
                double ryBase = (mdBase + mdTopo) / this.l;
                for (int k = 0; k < this.n; k++) {
                    double zk = (k * this.l) / (this.n - 1);
                    md[k] = (-mdBase) + (ryBase * zk);
                }
            }
            if (this.tipoVinculacao == 2) {
                for (int k2 = 0; k2 < this.n; k2++) {
                    double zk2 = (k2 * this.l) / (this.n - 1);
                    md[k2] = mdTopo + ((((-mdBase) - mdTopo) * (this.l - zk2)) / this.l);
                }
            }
        } else {
            double mdI = 0.0d;
            if (this.tipoVinculacao == 1) {
                double alphaB = 0.0d;
                double ma = Math.max(Math.abs(mdTopo), Math.abs(mdBase));
                double mb = Math.min(Math.abs(mdTopo), Math.abs(mdBase));
                if (mdTopo * (-mdBase) < 0.0d) {
                    ma = -ma;
                }
                if (ma != 0.0d) {
                    alphaB = Math.min(1.0d, Math.max(0.6d + ((0.4d * mb) / ma), 0.4d));
                }
                if (Math.abs(mdTopo) < Math.abs(mdBase)) {
                    mdI = (-mdBase) * alphaB;
                } else {
                    mdI = mdTopo * alphaB;
                }
            }
            if (this.tipoVinculacao == 2) {
                double alphaB2 = 0.0d;
                double ma2 = -mdBase;
                double mc = (mdTopo - mdBase) / 2.0d;
                if (ma2 != 0.0d) {
                    alphaB2 = Math.min(1.0d, Math.max(0.8d + ((0.2d * mc) / ma2), 0.85d));
                }
                mdI = ma2 * alphaB2;
            }
            md[0] = -mdBase;
            md[1] = mdI;
            md[2] = mdTopo;
        }
        return md;
    }

    private double[] calculaMomento2OrdP1(double nsd, double h, double[] md1) {
        double[] md2 = new double[3];
        System.arraycopy(md1, 0, md2, 0, 3);
        double ni = Math.abs((nsd / this.ac) / this.fcd);
        double invR = Math.min((0.005d / h) / (ni + 0.5d), 0.005d / h);
        if (md2[1] != 0.0d) {
            md2[1] = md2[1] - (((((((nsd * this.lFlamb) / 100.0d) * this.lFlamb) / 100.0d) / 10.0d) * invR) * (md2[1] / Math.abs(md2[1])));
        }
        return md2;
    }

    private double[] calculaMomento2OrdP2(double nsd, double h, double[] md1) {
        double[] md2 = new double[3];
        System.arraycopy(md1, 0, md2, 0, 3);
        double md1Max = Math.abs(md1[1]);
        double a = 5.0d * h;
        double b = ((((-h) * h) * nsd) + (((((nsd * this.lFlamb) / 100.0d) * this.lFlamb) / 100.0d) / 320.0d)) - ((5.0d * h) * md1Max);
        double c = nsd * h * h * md1Max;
        if (md2[1] != 0.0d) {
            md2[1] = ((((-b) + Math.sqrt((b * b) - ((4.0d * a) * c))) / 2.0d) / a) * (md2[1] / Math.abs(md2[1]));
        }
        return md2;
    }

    private double[] calculaMomento2OrdP3(double nsd, double h, double[] md1, int comb, String eixo, double lambda) {
        double[] md2 = new double[3];
        System.arraycopy(md1, 0, md2, 0, 3);
        if (md1[1] != 0.0d) {
            double ni = Math.abs((nsd / this.ac) / this.fcd);
            double kapa = this.f0dados.resultados.getEIsec(comb, md1[1], eixo) / (((this.ac * h) * h) * this.fcd);
            md2[1] = md2[1] / (1.0d - ((((lambda * lambda) / 120.0d) / kapa) * ni));
        }
        return md2;
    }

    private double[] calculaMomento2OrdP4(double nsd, double mdTopo, double mdBase, String eixo, int comb, String momento) {
        double nsd2 = nsd / this.f0dados.config.getGamaF3();
        double mdTopo2 = mdTopo / this.f0dados.config.getGamaF3();
        double mdBase2 = mdBase / this.f0dados.config.getGamaF3();
        double[] md = new double[this.n];
        int j = 0;
        boolean stop = false;
        List<Object[]> resultados = new ArrayList<>();
        while (!stop) {
            double[][] rIt = new double[6][this.n];
            double[] dArr = new double[this.n];
            if (j != 0) {
                double[] deltaItAnt = ((double[][]) resultados.get(j - 1))[5];
                System.arraycopy(deltaItAnt, 0, rIt[1], 0, this.n);
            }
            if (this.tipoVinculacao == 1) {
                if (this.limMb & ((-mdBase2) * mdTopo2 < 0.0d)) {
                    if (Math.abs(mdBase2) < Math.abs(mdTopo2)) {
                        if ((-Math.abs(mdBase2)) < (-0.5d) * Math.abs(mdTopo2)) {
                            mdBase2 = 0.5d * mdTopo2;
                        }
                    } else if ((-Math.abs(mdTopo2)) < (-0.5d) * Math.abs(mdBase2)) {
                        mdTopo2 = 0.5d * mdBase2;
                    }
                }
                double ryBase = (mdBase2 + mdTopo2) / this.l;
                for (int k = 0; k < this.n; k++) {
                    double zk = (k * this.l) / (this.n - 1);
                    double mk = (((-nsd2) * rIt[1][k]) - mdBase2) + (ryBase * zk);
                    rIt[0][k] = zk;
                    rIt[2][k] = mk;
                    if (mk != 0.0d) {
                        rIt[3][k] = (-mk) / this.f0dados.resultados.getEIsec(comb, mk, eixo);
                    } else {
                        rIt[3][k] = 0.0d;
                    }
                    if (k != 0) {
                        rIt[4][k] = rIt[4][k - 1] + (((rIt[3][k] + rIt[3][k - 1]) * (rIt[0][k] - rIt[0][k - 1])) / 2.0d);
                        rIt[5][k] = rIt[5][k - 1] + (((rIt[4][k] + rIt[4][k - 1]) * (rIt[0][k] - rIt[0][k - 1])) / 2.0d);
                    }
                }
                double constA = -rIt[5][this.n - 1];
                for (int k2 = 0; k2 < this.n; k2++) {
                    double zk2 = (k2 * this.l) / (this.n - 1);
                    rIt[4][k2] = rIt[4][k2] + (constA / this.l);
                    rIt[5][k2] = rIt[5][k2] + ((constA * zk2) / this.l);
                }
            }
            if (this.tipoVinculacao == 2) {
                for (int k3 = 0; k3 < this.n; k3++) {
                    double zk3 = (k3 * this.l) / (this.n - 1);
                    double mk2 = (nsd2 * (rIt[1][this.n - 1] - rIt[1][k3])) + mdTopo2 + ((((-mdBase2) - mdTopo2) * (this.l - zk3)) / this.l);
                    rIt[0][k3] = zk3;
                    rIt[2][k3] = mk2;
                    if (mk2 != 0.0d) {
                        rIt[3][k3] = (-mk2) / this.f0dados.resultados.getEIsec(comb, mk2, eixo);
                    } else {
                        rIt[3][k3] = 0.0d;
                    }
                    if (k3 != 0) {
                        rIt[4][k3] = rIt[4][k3 - 1] + (((rIt[3][k3] + rIt[3][k3 - 1]) * (rIt[0][k3] - rIt[0][k3 - 1])) / 2.0d);
                        rIt[5][k3] = rIt[5][k3 - 1] + (((rIt[4][k3] + rIt[4][k3 - 1]) * (rIt[0][k3] - rIt[0][k3 - 1])) / 2.0d);
                    }
                }
            }
            double max1 = 0.0d;
            double max5 = 0.0d;
            for (int k4 = 0; k4 < 11; k4++) {
                max1 = Math.max(max1, Math.abs(rIt[1][k4]));
                max5 = Math.max(max5, Math.abs(rIt[5][k4]));
            }
            if ((Math.abs(max5 - max1) / Math.abs(max5) < 1.0E-4d) | (max5 == 0.0d)) {
                if ("m".equals(momento)) {
                    this.f0dados.erros.setListaErro2Ord(comb, null);
                }
                if ("mMin".equals(momento)) {
                    this.f0dados.erros.setListaErro2OrdMmin(comb, null);
                }
                stop = true;
                System.arraycopy(rIt[2], 0, md, 0, this.n);
            } else {
                resultados.add(rIt);
            }
            if ((j >= this.nItMax) | (max5 > this.l)) {
                if ("m".equals(momento)) {
                    this.f0dados.erros.setListaErro2Ord(comb, "A determinação dos efeitos de 2ª ordem não convergiu com o número máximo iterações.");
                }
                if ("mMin".equals(momento)) {
                    this.f0dados.erros.setListaErro2OrdMmin(comb, "A determinação dos efeitos de 2ª ordem não convergiu com o número máximo iterações.");
                }
                stop = true;
            }
            j++;
        }
        for (int i = 0; i < md.length; i++) {
            md[i] = md[i] * this.f0dados.config.getGamaF3();
        }
        return md;
    }

    /* JADX WARN: Type inference failed for: r0v24, types: [double[], double[][]] */
    private double[][] calculaMomento2OrdP5(double nsd, double mdTopoX, double mdBaseX, double mdTopoY, double mdBaseY, int comb, String momento, boolean cal2ordX, boolean cal2ordY) {
        double nsd2 = nsd / this.f0dados.config.getGamaF3();
        double mdTopoX2 = mdTopoX / this.f0dados.config.getGamaF3();
        double mdBaseX2 = mdBaseX / this.f0dados.config.getGamaF3();
        double mdTopoY2 = mdTopoY / this.f0dados.config.getGamaF3();
        double mdBaseY2 = mdBaseY / this.f0dados.config.getGamaF3();
        double[] mdX = new double[this.n];
        double[] mdY = new double[this.n];
        int j = 0;
        boolean stop = false;
        List<Object[]> resultadosX = new ArrayList<>();
        List<Object[]> resultadosY = new ArrayList<>();
        while (!stop) {
            double[][] rItX = new double[6][this.n];
            double[] dArr = new double[this.n];
            double[][] rItY = new double[6][this.n];
            double[] dArr2 = new double[this.n];
            if (j != 0) {
                double[] deltaItAntX = ((double[][]) resultadosX.get(j - 1))[5];
                System.arraycopy(deltaItAntX, 0, rItX[1], 0, this.n);
                double[] deltaItAntY = ((double[][]) resultadosY.get(j - 1))[5];
                System.arraycopy(deltaItAntY, 0, rItY[1], 0, this.n);
            }
            if (this.tipoVinculacao == 1) {
                if (this.limMb & ((-mdBaseX2) * mdTopoX2 < 0.0d)) {
                    if (Math.abs(mdBaseX2) < Math.abs(mdTopoX2)) {
                        if ((-Math.abs(mdBaseX2)) < (-0.5d) * Math.abs(mdTopoX2)) {
                            mdBaseX2 = 0.5d * mdTopoX2;
                        }
                    } else if ((-Math.abs(mdTopoX2)) < (-0.5d) * Math.abs(mdBaseX2)) {
                        mdTopoX2 = 0.5d * mdBaseX2;
                    }
                }
                if (this.limMb & ((-mdBaseY2) * mdTopoY2 < 0.0d)) {
                    if (Math.abs(mdBaseY2) < Math.abs(mdTopoY2)) {
                        if ((-Math.abs(mdBaseY2)) < (-0.5d) * Math.abs(mdTopoY2)) {
                            mdBaseY2 = 0.5d * mdTopoY2;
                        }
                    } else if ((-Math.abs(mdTopoY2)) < (-0.5d) * Math.abs(mdBaseY2)) {
                        mdTopoY2 = 0.5d * mdBaseY2;
                    }
                }
                double ryBaseX = (mdBaseX2 + mdTopoX2) / this.l;
                double ryBaseY = (mdBaseY2 + mdTopoY2) / this.l;
                for (int k = 0; k < this.n; k++) {
                    double zk = (k * this.l) / (this.n - 1);
                    double deltaMkX = 0.0d;
                    if (cal2ordX) {
                        deltaMkX = (-nsd2) * rItX[1][k];
                    }
                    double deltaMkY = 0.0d;
                    if (cal2ordY) {
                        deltaMkY = (-nsd2) * rItY[1][k];
                    }
                    double mkX = (deltaMkX - mdBaseX2) + (ryBaseX * zk);
                    double mkY = (deltaMkY - mdBaseY2) + (ryBaseY * zk);
                    rItX[0][k] = zk;
                    rItX[2][k] = mkX;
                    rItY[0][k] = zk;
                    rItY[2][k] = mkY;
                    double[] eiSec = new ELS().ELS(this.f0dados, nsd2, mkX, mkY, true, 1.1d);
                    if (mkX != 0.0d) {
                        rItX[3][k] = (-mkX) / eiSec[7];
                    } else {
                        rItX[3][k] = 0.0d;
                    }
                    if (mkY != 0.0d) {
                        rItY[3][k] = (-mkY) / eiSec[8];
                    } else {
                        rItY[3][k] = 0.0d;
                    }
                    if (k != 0) {
                        rItX[4][k] = rItX[4][k - 1] + (((rItX[3][k] + rItX[3][k - 1]) * (rItX[0][k] - rItX[0][k - 1])) / 2.0d);
                        rItX[5][k] = rItX[5][k - 1] + (((rItX[4][k] + rItX[4][k - 1]) * (rItX[0][k] - rItX[0][k - 1])) / 2.0d);
                        rItY[4][k] = rItY[4][k - 1] + (((rItY[3][k] + rItY[3][k - 1]) * (rItY[0][k] - rItY[0][k - 1])) / 2.0d);
                        rItY[5][k] = rItY[5][k - 1] + (((rItY[4][k] + rItY[4][k - 1]) * (rItY[0][k] - rItY[0][k - 1])) / 2.0d);
                    }
                }
                double constAX = -rItX[5][this.n - 1];
                double constAY = -rItY[5][this.n - 1];
                for (int k2 = 0; k2 < this.n; k2++) {
                    double zk2 = (k2 * this.l) / (this.n - 1);
                    rItX[4][k2] = rItX[4][k2] + (constAX / this.l);
                    rItX[5][k2] = rItX[5][k2] + ((constAX * zk2) / this.l);
                    rItY[4][k2] = rItY[4][k2] + (constAY / this.l);
                    rItY[5][k2] = rItY[5][k2] + ((constAY * zk2) / this.l);
                }
            }
            if (this.tipoVinculacao == 2) {
                for (int k3 = 0; k3 < this.n; k3++) {
                    double zk3 = (k3 * this.l) / (this.n - 1);
                    double deltaMkX2 = 0.0d;
                    if (cal2ordX) {
                        deltaMkX2 = nsd2 * (rItX[1][this.n - 1] - rItX[1][k3]);
                    }
                    double deltaMkY2 = 0.0d;
                    if (cal2ordY) {
                        deltaMkY2 = nsd2 * (rItY[1][this.n - 1] - rItY[1][k3]);
                    }
                    double mkX2 = deltaMkX2 + mdTopoX2 + ((((-mdBaseX2) - mdTopoX2) * (this.l - zk3)) / this.l);
                    double mkY2 = deltaMkY2 + mdTopoY2 + ((((-mdBaseY2) - mdTopoY2) * (this.l - zk3)) / this.l);
                    rItX[0][k3] = zk3;
                    rItX[2][k3] = mkX2;
                    rItY[0][k3] = zk3;
                    rItY[2][k3] = mkY2;
                    double[] eiSec2 = new ELS().ELS(this.f0dados, nsd2, mkX2, mkY2, true, 1.1d);
                    if (mkX2 != 0.0d) {
                        rItX[3][k3] = (-mkX2) / eiSec2[7];
                    } else {
                        rItX[3][k3] = 0.0d;
                    }
                    if (mkY2 != 0.0d) {
                        rItY[3][k3] = (-mkY2) / eiSec2[8];
                    } else {
                        rItY[3][k3] = 0.0d;
                    }
                    if (k3 != 0) {
                        rItX[4][k3] = rItX[4][k3 - 1] + (((rItX[3][k3] + rItX[3][k3 - 1]) * (rItX[0][k3] - rItX[0][k3 - 1])) / 2.0d);
                        rItX[5][k3] = rItX[5][k3 - 1] + (((rItX[4][k3] + rItX[4][k3 - 1]) * (rItX[0][k3] - rItX[0][k3 - 1])) / 2.0d);
                        rItY[4][k3] = rItY[4][k3 - 1] + (((rItY[3][k3] + rItY[3][k3 - 1]) * (rItY[0][k3] - rItY[0][k3 - 1])) / 2.0d);
                        rItY[5][k3] = rItY[5][k3 - 1] + (((rItY[4][k3] + rItY[4][k3 - 1]) * (rItY[0][k3] - rItY[0][k3 - 1])) / 2.0d);
                    }
                }
            }
            double max1 = 0.0d;
            double max5 = 0.0d;
            for (int k4 = 0; k4 < 11; k4++) {
                max1 = Math.max(Math.max(max1, Math.abs(rItX[1][k4])), Math.abs(rItY[1][k4]));
                max5 = Math.max(Math.max(max5, Math.abs(rItX[5][k4])), Math.abs(rItY[5][k4]));
            }
            if ((Math.abs(max5 - max1) / Math.abs(max5) < 1.0E-4d) | (max5 == 0.0d)) {
                if ("m".equals(momento)) {
                    this.f0dados.erros.setListaErro2Ord(comb, null);
                }
                if ("mMin".equals(momento)) {
                    this.f0dados.erros.setListaErro2OrdMmin(comb, null);
                }
                stop = true;
                System.arraycopy(rItX[2], 0, mdX, 0, this.n);
                System.arraycopy(rItY[2], 0, mdY, 0, this.n);
            } else {
                resultadosX.add(rItX);
                resultadosY.add(rItY);
            }
            if ((j >= this.nItMax) | (max5 > this.l)) {
                if ("m".equals(momento)) {
                    this.f0dados.erros.setListaErro2Ord(comb, "A determinação dos efeitos de 2ª ordem não convergiu com o número máximo iterações.");
                }
                if ("mMin".equals(momento)) {
                    this.f0dados.erros.setListaErro2OrdMmin(comb, "A determinação dos efeitos de 2ª ordem não convergiu com o número máximo iterações.");
                }
                stop = true;
            }
            j++;
        }
        for (int i = 0; i < mdX.length; i++) {
            mdX[i] = mdX[i] * this.f0dados.config.getGamaF3();
            mdY[i] = mdY[i] * this.f0dados.config.getGamaF3();
        }
        return new double[]{mdX, mdY};
    }
}
