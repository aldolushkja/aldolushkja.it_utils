package it.aldolushkja.utils.interceptor;

import java.util.logging.Logger;
import javax.enterprise.inject.Produces;
import javax.enterprise.inject.spi.InjectionPoint;

public class LoggerProducer {

  @Produces
  public Logger logger(InjectionPoint ip) {
    return Logger.getLogger(ip.getMember().getDeclaringClass().getName());
  }

}
