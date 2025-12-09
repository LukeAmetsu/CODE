package pcalc;

import java.util.ArrayList;
import java.util.List;

/* loaded from: CalculaFs.class */
public class CalculaFs {
    public CalculaFs(Dados dados2) {
        Object[] esforcos = dados2.resultados.getesforcos();
        List<double[]> listMrxd2 = (List) esforcos[3];
        List<double[]> listMryd2 = (List) esforcos[4];
        List<double[][]> curvasMr = dados2.resultados.getCurvasMr();
        List<double[]> listfs = new ArrayList<>();
        List<double[]> listTeta = new ArrayList<>();
        int combFsMin = 0;
        double fsMin = 1.0E10d;
        for (int i = 0; i < listMrxd2.size(); i++) {
            if (dados2.erros.getListaErroNrd(i) == null) {
                double[] msxd2I = listMrxd2.get(i);
                double[] msyd2I = listMryd2.get(i);
                double[] fsI = new double[msxd2I.length];
                double[] tetaI = new double[msxd2I.length];
                for (int j = 0; j < msxd2I.length; j++) {
                    double tetaj = 0.0d;
                    double x = 0.0d;
                    double y = 0.0d;
                    double dist = 1.0E10d;
                    double TetaMax = 0.0d;
                    double TetaMomMax = -1.0E11d;
                    double xMax = -1.0E11d;
                    double yMax = -1.0E11d;
                    double xMin = 1.0E11d;
                    double yMin = 1.0E11d;
                    double msxd = msxd2I[j];
                    double msyd = msyd2I[j];
                    if ((msxd != 0.0d) | (msyd != 0.0d)) {
                        msxd = msxd == 0.0d ? 1.0E-9d : msxd;
                        msyd = msyd == 0.0d ? 1.0E-9d : msyd;
                        double m = msxd / msyd;
                        for (int k = 0; k < curvasMr.get(0)[0].length - 1; k++) {
                            double teta1 = curvasMr.get(i)[1][k];
                            double teta2 = curvasMr.get(i)[1][k + 1];
                            double x1 = curvasMr.get(i)[2][k];
                            double x2 = curvasMr.get(i)[2][k + 1];
                            double y1 = curvasMr.get(i)[3][k];
                            double y2 = curvasMr.get(i)[3][k + 1];
                            double xj = ((x2 * y1) - (x1 * y2)) / (((y1 - y2) + (x2 * m)) - (x1 * m));
                            double yj = m * xj;
                            if ((Math.min(x1, x2) < xj) & (xj < Math.max(x1, x2)) & (Math.min(y1, y2) < yj) & (yj < Math.max(y1, y2))) {
                                xMax = Math.max(xMax, xj);
                                yMax = Math.max(yMax, yj);
                                xMin = Math.min(xMin, xj);
                                yMin = Math.min(yMin, yj);
                                double distI = Math.sqrt((xj * xj) + (yj * yj));
                                if ((dist > distI) & (msyd * xj > 0.0d) & (msxd * yj > 0.0d)) {
                                    dist = distI;
                                    x = xj;
                                    y = yj;
                                    tetaj = teta1 + (((teta2 - teta1) * Math.sqrt(((xj - x1) * (xj - x1)) + ((yj - y1) * (yj - y1)))) / Math.sqrt(((x2 - x1) * (x2 - x1)) + ((y2 - y1) * (y2 - y1))));
                                }
                                if (TetaMomMax < Math.sqrt((xj * xj) + (yj * yj))) {
                                    TetaMax = teta1 + (((teta2 - teta1) * Math.sqrt(((xj - x1) * (xj - x1)) + ((yj - y1) * (yj - y1)))) / Math.sqrt(((x2 - x1) * (x2 - x1)) + ((y2 - y1) * (y2 - y1))));
                                    TetaMomMax = Math.sqrt((xj * xj) + (yj * yj));
                                }
                            }
                        }
                    }
                    if (!(curvasMr.get(i)[2][0] != 0.0d) && !(curvasMr.get(i)[3][0] != 0.0d)) {
                        fsI[j] = 0.0d;
                    } else if ((msxd != 0.0d) | (msyd != 0.0d)) {
                        fsI[j] = Math.sqrt((x * x) + (y * y)) / Math.sqrt((msyd * msyd) + (msxd * msxd));
                        tetaI[j] = tetaj;
                        if ((xMax * xMin > 0.0d) | (xMax * xMin > 0.0d)) {
                            if ((xMin <= msyd) & (msyd <= xMax) & (yMin <= msxd) & (msxd <= yMax)) {
                                fsI[j] = 1.0E10d;
                            } else {
                                fsI[j] = 0.0d;
                            }
                            tetaI[j] = TetaMax;
                        }
                    } else {
                        fsI[j] = 1.0E10d;
                    }
                    fsI[j] = Math.floor(fsI[j] * 100.0d) / 100.0d;
                    if (fsMin > fsI[j]) {
                        fsMin = fsI[j];
                        combFsMin = i;
                    }
                }
                listfs.add(fsI);
                listTeta.add(tetaI);
            } else {
                fsMin = 0.0d;
                combFsMin = i;
                listfs.add(new double[1]);
                listTeta.add(new double[1]);
            }
        }
        esforcos[5] = listfs;
        esforcos[6] = listTeta;
        dados2.resultados.setCombFsMi(combFsMin);
        dados2.resultados.setFsMi(fsMin);
        dados2.resultados.setEsforcos(esforcos);
    }
}
