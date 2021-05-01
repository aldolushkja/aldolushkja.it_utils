package it.aldolushkja.utils.interceptor;

import javax.enterprise.inject.Produces;
import javax.enterprise.inject.spi.InjectionPoint;

import org.slf4j.LoggerFactory;

public class LoggerProducer {

  @Produces
  public org.slf4j.Logger logger(InjectionPoint ip) {
    return LoggerFactory.getLogger(ip.getMember().getDeclaringClass().getName());
  }

}
